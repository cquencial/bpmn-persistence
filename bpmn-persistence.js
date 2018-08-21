import { check, Match } from 'meteor/check'
import { Mongo } from 'meteor/mongo'
import { Meteor } from 'meteor/meteor'

const _name = 'extensions:persistence'

const persistence = {}

////////////////////////////////////////////////////////////////////////////////////////
//
//  Define Collection
//
////////////////////////////////////////////////////////////////////////////////////////

const BpmnPersistenceCollectionSchema = {
  instanceId: String,
  state: {
    type: String,
  },
  hash: String,
  createdAt: {
    type: String,
  },
  createdBy: {
    type: String,
  }
}

const collectionName = 'BpmnPersistenceCollection'
const BpmnPersistenceCollection = new Mongo.Collection(collectionName)
BpmnPersistenceCollection.name = collectionName
BpmnPersistenceCollection.schema = BpmnPersistenceCollectionSchema
persistence.collection = BpmnPersistenceCollection

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
//  savePersistent
//
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hashMatch = Match.Where(h => !!h && typeof h === 'string' && h.length === 64)

const stateObjMatch = Match.Where(s => !!s && !!s.name && !!s.state && !!s.engineVersion && !!s.definitions)

persistence.has = function (instanceId) {
  check(instanceId, String)
  return !!BpmnPersistenceCollection.findOne({instanceId})
}

persistence.verify = function (state, hash) {
  check(state, Match.OneOf(String, stateObjMatch))
  check(hash, hashMatch)
  const stateStr = typeof state === 'string' ? state : JSON.stringify(state)
  return SHA256(stateStr) === hash
}

/**
 * Saves the current process' state. The state is serialized to a JSON, that can be dezerialized
 * using the Bpmn.loadPersistent method.
 */
persistence.save = function ({instanceId, state, userId = 'anonymous'}) {
  check(instanceId, String)
  check(state, stateObjMatch)
  check(userId, String)

  const timeStamp = new Date()

  const stateStr = JSON.stringify(state)
  const hash = SHA256(stateStr)

  if (BpmnPersistenceCollection.findOne({instanceId, hash})) {
    return false
  }

  const mongoCompatibleStateStr = stateStr.replace(/\$/g, '__dollar__') // TODO add compression

  const insertId = BpmnPersistenceCollection.insert({
    state: mongoCompatibleStateStr,
    hash,
    instanceId,
    createdAt: timeStamp,
    createdBy: userId,
  })

  if (!insertId)
    throw new Error('persistence doc not created for instanceId ' + instanceId)
  return insertId
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
//  loadPersistent
//
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function load (persistenceDoc) {
  const stateStr = persistenceDoc.state.replace(/__dollar__/g, '$')

  if (!persistence.verify(stateStr, persistenceDoc.hash))
    throw new Error('invalid hash signature for persistence state. instanceId=' + instanceId)

  const state = JSON.parse(stateStr)
  persistenceDoc.state = state
  return persistenceDoc
}

persistence.load = function (persistenceDocId) {
  check(persistenceDocId, String)
  const persistenceDoc = BpmnPersistenceCollection.findOne(persistenceDocId, {sort: {createdAt: -1}})
  return load(persistenceDoc)
}

persistence.latest = function (instanceId) {
  check(instanceId, String)

  const persistenceDoc = BpmnPersistenceCollection.findOne({instanceId}, {sort: {createdAt: -1}})
  return load(persistenceDoc)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
//  Hooks
//
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const persistenceHooks = {}

// EXECUTE

persistenceHooks.onExecuteBefore = function (engineFct, options) {

  const preventEvents = options && options.prevent

  // listen to engine's end unless prevented
  const preventEnd = preventEvents && preventEvents.end === false

  if (!preventEnd) {
    const engine = engineFct()
    engine.on('end', Meteor.bindEnvironment(() => {
      if (engine.stopped) return
      persistence.save({
        instanceId: engine.instanceId,
        state: engine.getState(),
        userId: this.userId,
      })
    }))
  }

  const persistenceListener = Bpmn.createListeners((element, instance, event) => {
    const engine = engineFct()
    // console.log("save on ", event);
    persistence.save({
      instanceId: engine.instanceId,
      userId: this.userId,
      state: engine.getState(),
    })

  }, preventEvents ? preventEvents : undefined)

  options.listener = Bpmn.mergeListeners({
    source: options.listener,
    target: persistenceListener,
  })
}

// RESUME

persistenceHooks.onResumeBefore = function (engineFct, options) {

  const preventEvents = options && options.prevent

  const persistenceListener = Bpmn.createListeners(() => {
    const engine = engineFct()
    persistence.save({
      instanceId: options.instanceId,
      state: engine && engine.getState(),
    })
  }, preventEvents)

  options.listener = Bpmn.mergeListeners({
    source: options.listener,
    target: persistenceListener,
  })
}

persistenceHooks.onResumeAfter = Meteor.bindEnvironment(function (engineFct, options) {
  const engine = engineFct()
  engine.instanceId = options.instanceId
  engine.on('end', () => {
    if (engine.stopped) return
    persistence.save({
      instanceId: options.instanceId,
      state: engine && engine.getState(),
    })
  })
})

// STOP

persistenceHooks.onStopBefore = Meteor.bindEnvironment(function (engineFct, options) {
  const engine = engineFct()
  persistence.save({instanceId: engine.instanceId, state: engine.getState()})
})

persistence.hooks = persistenceHooks

persistence.on = function on () {
  Bpmn.hooks.add(_name, persistenceHooks)
}

persistence.off = function off () {
  Bpmn.hooks.remove(_name)
}

////////////////////////////////////////////////////////////////////////////////////////
//
//  ASSIGN EXTENSION
//
////////////////////////////////////////////////////////////////////////////////////////

Bpmn.persistence = persistence
