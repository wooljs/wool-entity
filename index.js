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

const { Id,  Multi } = require('wool-validate')

class Entity {
  static build(name, fields) {
    return new Entity(name, fields)
  }
  constructor(name, fields) {
    this._name = name
    this._fields = fields
    fields.forEach( c => this[c.k] = c )
    if (! ('id' in this)) {
      this.id = Id('id', { prefix: name+': ' })
    }
    /*
    name.toLowerCase()+'Id'
    this[]
    */
    let l = this._fields.slice()
    l.unshift(this.id)
    this.existing = Multi(l)
    let n = this._fields.slice()
    n.unshift(this.id.asNew())
    this.asNew = Multi(n)
  }


/*
  async create(store, obj) {
    return
  }
*/
}
module.exports = Entity.build