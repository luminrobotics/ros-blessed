const rosnodejs = require('rosnodejs');
const _ = require('lodash');
const tf = require('tf-rosnodejs');

// const std_msgs = rosnodejs.require('std_msgs').msg;
// const SetBool = rosnodejs.require('std_srvs').srv.SetBool;

let log;
class ROS {

  constructor(_log, cb, logStreams = []) {
    log = _log;
    rosnodejs.log.clearStreams(); // remove all existing log streams
    // TODO: show errors/warnings somewhere in the app, not just in file-log
    // see (below)

    rosnodejs.initNode('/ros_blessed', {
      node: { forceExit: true },
      logging: {streams: logStreams}
    }).then((rosNode) => {
      this.rn = rosNode;
      tf.init(rosNode);
      this.updateState();
      setInterval(this.updateState.bind(this), 5000);
      cb();
    });
  }

  /** fetch the state from the ROS master and update the list of nodes we
  maintain */
  async updateState() {
    this.state = await this.getSystemState();
    const nodeNames = _.uniq(_.flattenDeep([
      Object.values(this.state.publishers),
      Object.values(this.state.subscribers),
      Object.values(this.state.services) ]));
    const nodes = {};
    const all = await Promise.all(nodeNames.map(async name => {
      const resp = await this.rn._node._masterApi.lookupNode('/ros-blessed', name, {});
      const uri = resp[2];
      return {name, uri};
    }));
    all.forEach(({name, uri}) => nodes[uri] = name);
    this.nodes = nodes;
  }

  getState() { return this.state; }

  getNodeName(nodeUri) { return this.nodes[nodeUri]; }

  async getTopics() {
    if (!this.rn) {
      console.warn('not connected to ROS master');
      return;
    }
    return this.rn._node._masterApi.getPublishedTopics();
  }

  async subscribe(topic, callback) {
    const response = await this.rn._node._masterApi.getPublishedTopics();
    const info = _.find(response.topics, {name: topic});
    this.rn.subscribe(topic, info.type, (data, size, nodeUri) =>
      callback(data, info.type, size, nodeUri));
  }

  unsubscribe(topic) {
    this.rn.unsubscribe(topic);
  }

  async getSystemState() {
    if (!this.rn) {
      console.warn('not connected to ROS master');
      return;
    }
    return this.rn._node._masterApi.getSystemState();
  }

  async getService(serviceName) {
    const options = {};
    const type = await this.rn.getServiceHeader(serviceName);
    return this.rn.serviceClient(serviceName, type.type);
  }

  getServiceDefinition(client) {
    const type = client.getType();
    const [pkg, subtype] = type.split('/');
    const Type = rosnodejs.require(pkg).srv[subtype];
    const template = JSON.stringify(new Type.Request());
    log(Type.Request.messageDefinition(), template);
    return template;
  }

  getTFForest() {
    return tf.getForest();
  }

  getTF = tf.getTF;

  shutdown() {
    rosnodejs.shutdown();
    log('shut down ros node');
  }
};

module.exports = ROS;
