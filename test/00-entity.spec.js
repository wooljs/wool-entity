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

'use strict'

const test = require('tape-async')
  , { Registry } = require(__dirname + '/../index.js')
  , { Id, Str, List, Dict } = require('wool-validate')
  , { Store } = require('wool-store')
  , email = require('email-address')
  , crypto = require('crypto')

// TODO ValidID, Crypto asymetric

test('Entity User, default id, no sub struct', async function(t) {
  let Entities = new Registry().withProxy()
    , store = new Store()
    , p = null

  Entities.add('User', [
    Str('email').predicate(email.isValid),
    Str('login').regex(/^\w{2,}$/),
    Str('password').regex(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/)
    .crypto(x => Buffer.from(x).toString('base64')) // base 64 is not a good hash for secure password, but this is a test
  ])
  let { User } = Entities

  await store.set('User: 42', {userId: '42', foo: 'bar'})
  t.ok(await User.userId.validate(store, { userId: '42' }))
  t.ok(await User.userId.asNew().validate(store, { }))
  t.ok(await User.email.validate(store, { email: 'foo@bar.com' }))
  t.ok(await User.password.validate(store, p = { password: 'xD5Ae8f4ysFG9luB' }))
  t.deepEqual(p, { password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg=='})

  t.ok(await Entities.User.existing().validate(store, p = { userId: '42', login: 'foo', email: 'foo@bar.com', password: 'xD5Ae8f4ysFG9luB'}))
  t.deepEqual(p, { userId: '42', login: 'foo', email: 'foo@bar.com', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg=='})

  t.ok(await Entities.User.asNew().validate(store, p = { login: 'foo', email: 'foo@bar.com', password: 'xD5Ae8f4ysFG9luB'}))
  t.ok('userId' in p)
  t.deepEqual(p, { userId: p.userId, login: 'foo', email: 'foo@bar.com', password: 'eEQ1QWU4ZjR5c0ZHOWx1Qg=='})

  t.plan(10)
  t.end()
})

test('Entity Session, custom id, foreign key', async function(t) {
  let Entities = new Registry().withProxy()
    , User = Entities.add('User', [
      Str('email').predicate(email.isValid),
      Str('login').regex(/^\w{2,}$/),
      Str('password').regex(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/)
      .crypto(x => Buffer.from(x).toString('base64')) // base 64 is not a good hash for secure password, but this is a test
    ])
    , Session = Entities.add('Session', [
      Id('sessid', {prefix: 'Session: ', algo: async () => {
        return new Promise((resolve, reject) => {
          crypto.randomBytes(24, (err, buf) => {
            if (err) return reject(err)
            resolve(buf.toString('base64'))
          })
        })
      } }),
      Str('login').regex(/^\w{2,}$/),
      User.userId
    ], {altid: 'sessid'})
    , store = new Store()

  await store.set('Session: 42', {sessid: '42', foo: 'bar'})
  t.ok(await Session.sessid.validate(store, { sessid: '42' }))


  t.plan(1)
  t.end()
})

test.skip('Entity Chatroom, list of foreign key, sub Dict', async function(t) {
  let Entities = new Registry().withProxy()
    , User = Entities.add('User', [
      Str('email').predicate(email.isValid),
      Str('login').regex(/^\w{2,}$/),
      Str('password').regex(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/)
      .crypto(x => Buffer.from(x).toString('base64')) // base 64 is not a good hash for secure password, but this is a test
    ])
    , Chatroom = Entities.add('Chatroom', [
      Str('name').regex(/^.{,64}$/),
      { 'users': List(User.id) },
      Dict(User.id, User.login),
      List(Str(/*???*/))
    ])
    , store = new Store()

  await store.set('Chatroom: 42', {id: '42', foo: 'bar'})
  t.ok(await Chatroom.id.validate(store, { id: '42' }))


  t.plan(9)
  t.end()
})
