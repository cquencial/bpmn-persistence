/* global describe it Random */
import { Meteor } from 'meteor/meteor'
import { SHA256 } from 'meteor/sha'
import { Bpmn } from 'meteor/cquencial:bpmn-engine'
import { assert } from 'meteor/practicalmeteor:chai'

const {EventEmitter} = require('events')

const processXml = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <task id="simpleTask" />
    <endEvent id="theEnd" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="simpleTask" />
    <sequenceFlow id="flow2" sourceRef="simpleTask" targetRef="theEnd" />
  </process>
</definitions>`

const processWithUserTask = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="theProcess" isExecutable="true">
    <startEvent id="theStart" />
    <userTask id="userTask" />
    <endEvent id="theEnd" />
    <sequenceFlow id="flow1" sourceRef="theStart" targetRef="userTask" />
    <sequenceFlow id="flow2" sourceRef="userTask" targetRef="theEnd" />
  </process>
</definitions>`

const defaultState = {
  name: 'undefined',
  state: 'running',
  engineVersion: '4.2.0',
  definitions:
    [{
      id: 'anonymous',
      state: 'running',
      moddleContext: [{}],
      processes: [{}]
    }]
}

const Events = {
  start: 'start',
  enter: 'enter',
  end: 'end',
  wait: 'wait',
  leave: 'leave',
  taken: 'taken',
  cancel: 'cancel',
  error: 'error',
  discarded: 'discarded',
}

describe('bpmn-persistence', function () {

  const isDefined = function (target, expectedType) {
    assert.isDefined(target)
    assert.equal(typeof target, expectedType, 'expected ' + expectedType + ' got ' + typeof target)
  }

  let userId
  let instanceId

  beforeEach(() => {
    Bpmn.persistence.on()

    userId = Random.id()
    instanceId = Random.id()
  })

  afterEach(() => {
    Bpmn.persistence.off()
  })

  const createDoc = function (_instanceId, _state, _userId) {
    const insertDocId = Bpmn.persistence.save({instanceId: _instanceId, state: _state, userId: _userId})
    const insertDoc = Bpmn.persistence.collection.findOne(insertDocId)
    isDefined(insertDoc.createdAt, 'object')
    isDefined(insertDoc.createdBy, 'string')
    isDefined(insertDoc.state, 'string')
    assert.equal(insertDoc.instanceId, instanceId)
    isDefined(insertDoc.hash, 'string')
    return insertDoc
  }

  describe('Bpmn.persistence.collection', function () {

    it('has a name', function () {
      isDefined(Bpmn.persistence.collection.name, 'string')
    })

    it('has an optional schema definition', function () {
      isDefined(Bpmn.persistence.collection.schema, 'object')
    })
  })

  describe('Bpmn.persistence.save', function () {

    it('creates a new entry', function () {
      createDoc(instanceId, defaultState, userId)
    })

    it('throws on wrong or missing parameters', function () {

      assert.throws(function () {
        Bpmn.persistence.create({instanceId, state: defaultState, userId: null})
      })

      assert.throws(function () {
        Bpmn.persistence.create({instanceId: null, state: defaultState, userId})
      })

      assert.throws(function () {
        Bpmn.persistence.create({instanceId, state: {}, userId})
      })
    })

    it('creates one persistence document per event', function (done) {
      const engine = new Bpmn.Engine({source: processXml, instanceId})

      engine.on('end', Meteor.bindEnvironment(() => {
        Meteor._sleepForMs(150)
        const persistenceDocs = Bpmn.persistence.collection.find({instanceId}).fetch()
        assert.equal(persistenceDocs.length, 10)
        done()
      }))

      const preventEvents = {
        leave: false,
        taken: false,
        error: false,
        discarded: false,
      }

      engine.execute({prevent: preventEvents})
    })

    it('can be prevented by event type', function (done) {
      const engine = new Bpmn.Engine({source: processXml, instanceId})

      engine.on('end', Meteor.bindEnvironment(() => {
        Meteor._sleepForMs(150)
        const persistenceDocs = Bpmn.persistence.collection.find({instanceId}).fetch()
        assert.equal(persistenceDocs.length, 0)
        done()
      }))

      // prevent all!
      const preventEvents = Object.assign({}, Bpmn.Events)
      Object.keys(preventEvents).forEach((key) => {
        preventEvents[key] = false
      })
      engine.execute({prevent: preventEvents})
    })
  })

  describe('Bpmn.persistence.has', function () {

    it('tells if there is a persistent state by instanceId', function () {
      assert.isFalse(Bpmn.persistence.has(instanceId))
      createDoc(instanceId, defaultState, userId)
      assert.isTrue(Bpmn.persistence.has(instanceId))
    })

    it('throws missing instanceId', function () {
      assert.throws(function () {
        Bpmn.persistence.has()
      })
    })
  })

  describe('Bpmn.persistence.verify', function () {

    it('verifies a state by a given hash', function () {
      const hash = SHA256(JSON.stringify(defaultState))
      assert.isTrue(Bpmn.persistence.verify(defaultState, hash))
      const updatedState = Object.assign({}, defaultState)
      updatedState.state = 'pending'
      assert.isFalse(Bpmn.persistence.verify(updatedState, hash))
    })

    it('throws missing parameters', function () {
      assert.throws(function () {
        Bpmn.persistence.verify()
      })

      assert.throws(function () {
        Bpmn.persistence.verify({}, Random.id())
      })

      assert.throws(function () {
        Bpmn.persistence.verify(defaultState)
      })
    })
  })

  describe('Bpmn.persistence.save', function () {

    it('updates an existing entry', function () {
      createDoc(instanceId, defaultState, userId)
      const updatedState = Object.assign({}, defaultState)
      updatedState.state = 'pending'

      const updated = Bpmn.persistence.save({instanceId, state: updatedState, userId})
      assert.isTrue(!!updated)
    })

    it('throws on missing paramteters', function () {
      assert.throws(function () {
        Bpmn.persistence.save()
      })
      assert.throws(function () {
        Bpmn.persistence.save({})
      })
      assert.throws(function () {
        Bpmn.persistence.save({instanceId: Random.id()})
      })
      assert.throws(function () {
        Bpmn.persistence.save({instanceId, state: {}})
      })
    })
  })

  describe('Bpmn.persistence.latest', function () {

    it('it returns by instanceId the latest running state', function () {
      createDoc(instanceId, defaultState, userId)

      const updatedState = Object.assign({}, defaultState)
      updatedState.state = 'pending'

      createDoc(instanceId, updatedState, userId)

      const persistenceDoc = Bpmn.persistence.latest(instanceId)
      assert.deepEqual(persistenceDoc.state, updatedState)
    })

    it('throws on a missing instanceId', function () {
      assert.throws(function () {
        Bpmn.persistence.latest()
      })

      assert.throws(function () {
        Bpmn.persistence.latest(Random.id())
      })
    })
  })

  describe('Bpmn.persistence.load', function () {

    it('it returns a specific persistence doc by _id', function () {
      const persistenceDocId = createDoc(instanceId, defaultState, userId)._id

      const persistenceDoc = Bpmn.persistence.load(persistenceDocId)
      assert.deepEqual(persistenceDoc.state, defaultState)
    })

    it('throws on a missing persistenceDocId', function () {
      assert.throws(function () {
        Bpmn.persistence.load()
      })

      assert.throws(function () {
        Bpmn.persistence.load(Random.id())
      })
    })
  })

  describe('Engine.execute', function () {

    it('does not save the state on before entering the first process element', function (done) {
      const engine = new Bpmn.Engine({source: processWithUserTask})
      assert.isFalse(Bpmn.persistence.has(engine.instanceId))
      engine.execute({}, Meteor.bindEnvironment((err, res) => {
        Meteor._sleepForMs(150)
        const state = res.getState()
        if (state.state === 'idle')
          assert.isFalse(Bpmn.persistence.has(engine.instanceId))
        else
          assert.isTrue(Bpmn.persistence.has(engine.instanceId))
        done()
      }))
      assert.isFalse(Bpmn.persistence.has(engine.instanceId))
    })
  })

  describe('Engine.stop', function () {

    it('saves state just before stop', function (done) {
      const engine = new Bpmn.Engine({source: processWithUserTask})

      let stateBeforeStop

      const waitListener = new EventEmitter()
      waitListener.on('wait', Meteor.bindEnvironment(() => {
        stateBeforeStop = engine.getState()
        engine.stop()
      }))

      engine.on('end', Meteor.bindEnvironment(() => {
        console.log('on end')
        Meteor._sleepForMs(100)
        const persistenceDoc = Bpmn.persistence.latest(engine.instanceId)
        const hash = SHA256(JSON.stringify(stateBeforeStop))
        assert.equal(persistenceDoc.hash, hash)
        done()
      }))

      engine.execute({listener: waitListener})
    })

    it('\'does not save the state after stop', function (done) {
      const engine = new Bpmn.Engine({source: processWithUserTask})

      let stateBeforeStop
      let stateAfterStop
      const waitListener = new EventEmitter()
      waitListener.on('wait', Meteor.bindEnvironment(() => {
        stateBeforeStop = engine.getState()
        engine.stop()
      }))

      engine.on('end', Meteor.bindEnvironment(() => {
        console.log('on end')
        Meteor._sleepForMs(100)
        stateAfterStop = engine.getState()

        const persistenceDoc = Bpmn.persistence.latest(engine.instanceId)
        const hashBeforeStop = SHA256(JSON.stringify(stateBeforeStop))
        const hashAfterStop = SHA256(JSON.stringify(stateBeforeStop))
        assert.equal(hashBeforeStop, hashAfterStop)
        assert.equal(persistenceDoc.hash, hashBeforeStop)
        done()
      }))

      engine.execute({listener: waitListener})
    })
  })

  describe('Engine.resume', function () {
    it('resume can fully restore from the persisted state', function (done) {
      this.userId = Random.id()
      const engine = new Bpmn.Engine({source: processWithUserTask})
      let complete = false

      const waitListener = new EventEmitter()
      waitListener.on('wait', () => {
        console.log('wait', complete)
        if (complete)
          done()
        else
          engine.stop()
      })

      engine.on('end', Meteor.bindEnvironment(() => {
        Meteor._sleepForMs(300)
        const persistenceDoc = Bpmn.persistence.latest(engine.instanceId)
        complete = true
        Bpmn.Engine.resume(persistenceDoc.state, {instanceId: engine.instanceId, listener: waitListener})
      }))

      engine.execute({listener: waitListener})
    })

    it('does not save state after resume before the first process element has entered', function (done) {
      this.userId = Random.id()
      const engine = new Bpmn.Engine({source: processWithUserTask})
      let complete = false

      const waitListener = new EventEmitter()
      waitListener.on('wait', () => {
        engine.stop()
      })

      engine.on('end', Meteor.bindEnvironment(() => {
        Meteor._sleepForMs(300)
        const persistenceDoc = Bpmn.persistence.latest(engine.instanceId)
        complete = true
        Bpmn.Engine.resume(persistenceDoc.state, {instanceId: engine.instanceId})
        const persistenceDocAfter = Bpmn.persistence.latest(engine.instanceId)
        assert.deepEqual(persistenceDocAfter, persistenceDoc)
        done()
      }))

      engine.execute({listener: waitListener})
    })
  })
})
