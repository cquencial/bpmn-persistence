# bpmn-persistence


Providing a persistence layer for cquencial:bpmn-engine.

### Installation

Add this package with `cquencial:bpmn-engine` to your packages list (if you didn't already install `cquencial:bpmn-engine`):

`meteor add cquencial:bpmn-engine cquencial:bpmn-persistence`

In your server environment you need to switch the extension to `on`:


### Usage

```javascript
import { Bpmn } from 'cquencial:bpmn-engine';

Bpmn.persistence.on();
```

This activates the extension to listen to every possible BPMN process state change and creates a new persistence state,
that is saved to the collection.

If you want to extension to be `off` just call

```javascript
Bpmn.persistence.off();
```


### Collection

The extension includes a Mongo.Collection by default. To obtain the collection, you can simply do

```javascript
const PersistenceCollection = Bpmn.persistence.collection;
```

or by using `dburles:mongo-collection-instances`:

```javascript
const PersistenceCollection = Mongo.Collection.get('BpmnPersistenceCollection');
```
The collection has no schema attached (as in terms of collection level validation) as it is up to you to decide, whether and how to do that.

However, the package follows implictly a schema, that is also added as property to the collection:

The collection schema is the following:

```javascript
BpmnPersistenceCollection.schema = {
  instanceId: String, // used to identify each instance
  state: {            // stringified state object*
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
```

**Notes:**

*The `state` can be used to restore a process with all it's corresponding details.
Read more about `state` in the original [bpmn-engine npm package](https://github.com/paed01/bpmn-engine/blob/master/API.md#getstate).

The `hash` is a calculated sha256 sum of the stringified state.


### Publications

There is no default publication included with this package as this should be your decision what data to publish to whom.