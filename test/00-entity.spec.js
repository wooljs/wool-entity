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

import test from 'tape'
import { Registry, Model, InvalidEntityError } from '../index.js'
import { Id, Str, List, Dict, InvalidRuleError } from 'wool-validate'
import { Store } from 'wool-store'
import email from 'email-address'
import crypto from 'crypto'

test('Entity User, default id, no sub struct', async function (t) {
  const Entities = new Registry().withProxy()
  const store = new Store()
  let p = null

  Entities.add('User', [
    Str('email').predicate(email.isValid),
    Str('login').regex(/^\w{2,}$/),
    Str('password').regex(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/)
      .crypto(x => Buffer.from(x).toString('base64')) // base 64 is not a good hash for secure password, but this is a test
  ])
  t.ok('User' in Entities)

  const { User } = Entities

  t.deepEqual(User.getEntityName(), 'User')
  t.deepEqual(User.getEntityId(), 'userId')

  t.ok('email' in User)

  await store.set('User: 42', { userId: '42', foo: 'bar' })
  t.ok(typeof await User.id.validate(store, { userId: '42' }) === 'undefined')
  t.ok(typeof await User.userId.validate(store, { userId: '42' }) === 'undefined')
  t.ok(typeof await User.id.asNew().validate(store, {}) === 'undefined')
  t.ok(typeof await User.userId.asNew().validate(store, {}) === 'undefined')
  t.ok(typeof await User.email.validate(store, { email: 'foo@bar.com' }) === 'undefined')
  t.ok(typeof await User.password.validate(store, p = { password: 'xD5Ae8f4ysFG9luB' }) === 'undefined')
  t.deepEqual(p, { password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg==' })

  t.ok(typeof await Entities.User.existing().validate(store, p = { userId: '42', login: 'foo', email: 'foo@bar.com', password: 'xD5Ae8f4ysFG9luB' }) === 'undefined')
  t.deepEqual(p, { userId: '42', login: 'foo', email: 'foo@bar.com', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg==' })

  t.ok(typeof await Entities.User.asNew(k => k !== 'email').validate(store, { login: 'foo', password: 'xD5Ae8f4ysFG9luB' }) === 'undefined')
  t.ok(typeof await Entities.User.existing(k => k !== 'password').validate(store, { userId: '42', login: 'foo', email: 'foo@bar.com' }) === 'undefined')

  const user42 = await User.byId(store, '42')
  t.deepEqual(user42, { userId: '42', foo: 'bar' })

  t.ok(typeof await Entities.User.asNew().validate(store, p = { login: 'foo', email: 'foo@bar.com', password: 'xD5Ae8f4ysFG9luB' }, new Date('2022-09-06T11:11:11.111Z')) === 'undefined')
  t.ok('userId' in p)
  t.deepEqual(p, { userId: p.userId, login: 'foo', email: 'foo@bar.com', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg==' })

  await User.save(store, p)

  const userP = await User.byId(store, p.userId)
  t.deepEqual(userP, { userId: p.userId, login: 'foo', email: 'foo@bar.com', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg==' })

  //*
  userP.email = 'trololo@plop.org'
  await User.save(store, userP)
  const userQ = await User.byId(store, p.userId)
  t.deepEqual(userQ, { userId: p.userId, login: 'foo', email: 'trololo@plop.org', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg==' })
  //* /

  t.deepEqual(User.changed(user42, userP), [
    { e: 'User', i: '42' },
    { e: 'User', i: '0183127f39070000' }
  ])

  t.plan(22)
  t.end()
})

test('Entity Session, custom id, foreign key, methods', async function (t) {
  const Entities = new Registry().withProxy()
  const Login = Str('login').regex(/^\w{2,}$/)
  const User = Entities.add('User', [
    Login
  ])
  const Session = Entities.add('Session', [
    Id('sessid', {
      prefix: 'Session: ',
      algo: async () => {
        return new Promise((resolve, reject) => {
          crypto.randomBytes(24, (err, buf) => {
            if (err) return reject(err)
            resolve(buf.toString('base64'))
          })
        })
      }
    }),
    Login,
    User.userId
  ], {
    altid: 'sessid',
    methods: {
      async userFromSession (store, sessid) {
        const { userId } = await this.byId(store, sessid)
        return await User.byId(store, userId)
      },
      async deleteAll (store) {
        for (const [k] of store.find()) {
          await store.del(k)
        }
      }
    },
    statics: {
      Login
    }
  })
  const store = new Store()
  let p = null

  t.ok('userFromSession' in Session)

  await store.set('User: 11', { userId: '11', login: 'foo' })
  await store.set('User: 12', { userId: '12', login: 'bar' })
  await store.set('Session: 42', { sessid: '42', foo: 'bar' })
  t.ok(typeof await Session.sessid.validate(store, { sessid: '42' }) === 'undefined')

  t.ok(typeof await Session.asNew().validate(store, p = { login: 'foo', userId: '11' }) === 'undefined')

  await Session.asNew().validate(store, { login: 'foo', userId: '13' })
    .then(() => t.fail('should throw'))
    .catch(e => {
      t.ok(e instanceof InvalidRuleError)
      t.deepEqual(e.toString(), 'InvalidRuleError: param.should.exists.in.store(ValidId[k:userId], 13)')
    })

  await Session.save(store, p)

  const u = await Session.userFromSession(store, p.sessid)

  t.deepEqual(u, { userId: '11', login: 'foo' })

  await Session.deleteAll(store)

  for (const e of Session.find(store, p.sessid)) {
    t.fail('should not be here ' + e)
  }

  t.notOk(await Session.byId(store, p.sessid))

  t.deepEqual(Session.Login, Login)

  t.plan(8)
  t.end()
})

test('Entity Chatroom, Dict of foreign key, Model', async function (t) {
  class ChatroomModel extends Model {
    addMessage (str) {
      this.message.push(str)
    }
  }
  const Entities = new Registry().withProxy()
  const User = Entities.add('User', [
    Str('login').regex(/^\w{2,}$/)
  ])
  const Chatroom = Entities.add('Chatroom', [
    Str('name').regex(/^.{0,64}$/),
    Dict('users', User.id, User.login),
    List('message', Str())
  ], {
    model: ChatroomModel
  })
  const store = new Store()
  let p = null
  const ts = new Date()

  await store.set('User: 11', { userId: '11', login: 'foo' })
  await store.set('User: 12', { userId: '12', login: 'bar' })
  await store.set('Chatroom: 42', { chatroomId: '42', name: 'Foo\'s nest', users: { 11: 'foo' }, message: ['Welcome to Foo\'snest!'] })

  t.ok(typeof await Chatroom.id.validate(store, { chatroomId: '42' }) === 'undefined')
  t.ok(typeof await Chatroom.asNew().validate(store, p = { name: 'bar', users: { 11: 'foo', 12: 'bar' }, message: [] }, ts) === 'undefined')
  await Chatroom.save(store, p)

  await Chatroom.asNew().validate(store, { name: 'barbar', users: { 11: 'foo', 12: 'bar', 13: 'dude' }, message: ['welcome'] }, ts) // same timestamp, but we should be covered by default algo impl
    .then(() => t.fail('should throw'))
    .catch(e => {
      t.ok(e instanceof InvalidRuleError)
      t.deepEqual(e.toString(), 'InvalidRuleError: param.invalid.dict.key(DictCheck[k:users], param.should.exists.in.store(ValidId[k:userId], 13))')
    })

  let chatroom = await Chatroom.byId(store, '42')

  t.ok(chatroom instanceof ChatroomModel)

  for (const [, c] of Chatroom.find(store)) {
    t.ok(c instanceof ChatroomModel)
  }

  chatroom = await Chatroom.findOne(store, ([, x]) => x.name === 'bar')
  t.ok(chatroom instanceof ChatroomModel)
  t.deepEqual(chatroom, new ChatroomModel(p))

  await Chatroom.sub(store, 'me', p.chatroomId, function (k, v, u) { t.ok(k && v.name === 'rebar' && u === 'set') })

  chatroom.name = 'rebar'
  chatroom.addMessage('plop plop')

  t.ok(typeof await Chatroom.existing().validate(store, chatroom) === 'undefined')
  await Chatroom.save(store, chatroom)

  chatroom = await Chatroom.findOne(store, ([, x]) => x.name === 'rebar')
  t.ok(chatroom instanceof ChatroomModel)
  t.deepEqual(chatroom, new ChatroomModel({ chatroomId: p.chatroomId, name: 'rebar', users: { 11: 'foo', 12: 'bar' }, message: ['plop plop'] }))

  t.ok(await Chatroom.exists(store, p.chatroomId))
  await Chatroom.unsub(store, 'me', p.chatroomId) // to avoid delete pub
  await Chatroom.delete(store, p.chatroomId)
  t.notOk(await Chatroom.exists(store, p.chatroomId))

  t.plan(15)
  t.end()
})

test('Entity Bad Model', async function (t) {
  const Entities = new Registry().withProxy()
  const Bad = Entities.add('Bad', [
    Str('foo')
  ], {
    model: class BadModel { }
  })
  const store = new Store()

  await store.set('Bad: 11', { badId: '11', foo: 'foo' })

  await Bad.byId(store, '11')
    .then((r) => {
      t.notOk(typeof r === 'undefined')
      t.fail('should throw')
    })
    .catch(e => {
      t.ok(e instanceof InvalidEntityError)
      t.deepEqual(e.toString(), 'InvalidEntityError: entity.affect.model.invalid(class BadModel { })')
    })

  t.plan(2)
  t.end()
})
