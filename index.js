/*
 * Copyright 2018 Nicolas Lochet Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

const { Id, Multi } = require('wool-validate')

class InvalidEntityError extends Error {
  constructor(message, ...params) {
    const f = (p) => (p && (typeof p === 'object') && p.toString().startsWith('[object')) ? JSON.stringify(p) : p
    super(message + (params.length > 0 ? '(' + params.map(f).join(', ') + ')' : ''))
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
    this.params = params
  }
}

class WithProxy {
  constructor() {
    this.proxy = null
  }
  withProxy() {
    let proto = Object.getPrototypeOf(this)
      , mine = Object.getOwnPropertyNames(proto)
        .filter(n => !n.startsWith('_'))
        .reduce((p, c) => {
          p[c] = true; return p
        }, {})
      , proxy = new Proxy(this, {
        has(target, key) {
          return target._has(key)
        },
        get(target, key) {
          if (mine[key]) return target[key].bind(target)
          return target._get(key)
        }
      })
    this.setProxy(proxy)
    return proxy
  }
  setProxy(proxy) {
    this.proxy = proxy
  }
}

class Registry extends WithProxy {
  constructor() {
    super()
    this.entities = new Map()
  }
  _has(key) {
    return this.entities.has(key)
  }
  _get(key) {
    return this.entities.get(key)
  }
  add(name, fieldDefs, opt = {}) {
    let fields = new Map()
    fieldDefs.forEach(c => fields.set(c.k, c))
    let id = opt && ('altid' in opt) ? opt.altid : name.toLowerCase() + 'Id'
    if (!fields.has(id)) {
      fields.set(id, Id(id, { prefix: name + ': ' }))
    }
    let fid = fields.get(id)
    let entity = new Entity(name, id, fid, fields, opt.model, opt.statics, opt.methods).withProxy()
    this.entities.set(name, entity)
    return entity
  }
}

class Entity extends WithProxy {
  constructor(name, id, fid, fields, model, statics, methods) {
    super()
    this.name = name
    this.id = id
    this.fid = fid
    this.fields = fields
    this.model = model
    this.methods = methods || {}
    this.statics = statics || {}
  }
  _find(key, fieldApply, staticApply, methodApply) {
    if (key in this.statics) return staticApply(key)
    if (key in this.methods) return methodApply(key)
    if (key === 'id') return fieldApply(this.id)
    return fieldApply(key)
  }
  _has(key) {
    return this._find(key, k => this.fields.has(k), () => true, () => true)
  }
  _get(key) {
    return this._find(key, k => this.fields.get(k), k => this.statics[k], k => this.methods[k].bind(this.proxy))
  }
  getEntityName() { return this.name }
  getEntityId() { return this.id }
  //getEntityFields(){ return this.fields }
  existing(f = () => true) {
    let l = []
    this.fields.forEach((v, k) => { if (f(k, v)) l.push(v) })
    return Multi(l)
  }
  asNew(f = () => true) {
    let l = []
    this.fields.forEach((v, k) => {
      if (f(k, v)) {
        if (k === this.id) v = v.asNew()
        l.push(v)
      }
    })
    return Multi(l)
  }
  async exists(store, id) {
    return await store.has(this.fid.as(id))
  }
  modelize(r) {
    if (this.model && typeof r === 'object') {
      if (this.model.prototype instanceof Model) return new this.model(r)
      else throw new InvalidEntityError('entity.affect.model.invalid', this.model)
    }
    return r
  }
  async byId(store, id) {
    return this.modelize(await store.get(this.fid.as(id)))
  }
  find(store, q) {
    q = q || (() => true)
    if (!this.model) {
      return store.find(([k, v]) => this.fid.isOne(k) && q([k, v]))
    } else {
      return store.find(([k, v]) => this.fid.isOne(k) && q([k, this.modelize(v)]), v => this.modelize(v))
    }
  }
  count(store, q) {
    let count = 0
    for (const [,] of this.find(store, q)) {
      count++
    }
    return count
  }
  async findOne(store, q) {
    return this.modelize(await store.findOne(([k, v]) => this.fid.isOne(k) && q([k, this.modelize(v)])))
  }
  async save(store, p) {
    await store.set(this.fid.as(p[this.id]), p)
  }
  async delete(store, k) {
    await store.del(this.fid.as(k))
  }
  async sub(store, src, k, cb, now) {
    await store.sub(src, this.fid.as(k), cb, now)
  }
  async pub(store, k) {
    await store.pub(this.fid.as(k))
  }
  async hasSub(store, src, k) {
    return await store.hasSub(src, this.fid.as(k))
  }
  async unsub(store, src, k) {
    await store.unsub(src, this.fid.as(k))
  }
}

class Model {
  constructor(o) {
    Object.assign(this, o)
  }
}

module.exports = {
  Entity, Registry, Model, InvalidEntityError,
  Entities: new Registry().withProxy()
}