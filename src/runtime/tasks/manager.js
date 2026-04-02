const { MglFuture } = require("../async");

class MglTaskHandle {
  constructor(id, name, promise) {
    this.id = id;
    this.name = name;
    this.promise = Promise.resolve(promise);
    this.status = "running";
    this.cancelled = false;
    this.result = null;
    this.error = null;

    this.promise = this.promise
      .then((value) => {
        this.status = this.cancelled ? "cancelled" : "completed";
        this.result = value;
        return value;
      })
      .catch((error) => {
        this.status = this.cancelled ? "cancelled" : "failed";
        this.error = error;
        throw error;
      });
  }

  cancel() {
    this.cancelled = true;
    if (this.status === "running") {
      this.status = "cancelled";
    }
    return true;
  }

  toString() {
    return `<task ${this.name} ${this.status}>`;
  }
}

class TaskManager {
  constructor() {
    this.nextId = 1;
    this.handles = new Map();
  }

  startTask(name, runner) {
    const id = this.nextId;
    this.nextId += 1;
    let handle = null;
    const promise = Promise.resolve().then(() => runner(handle));
    handle = new MglTaskHandle(id, name, promise);
    this.handles.set(id, handle);
    return handle;
  }

  list() {
    return Array.from(this.handles.values());
  }

  getByName(name) {
    return this.list().find((handle) => handle.name === name) || null;
  }

  wait(handle) {
    return new MglFuture(handle.promise, { label: `task:${handle.name}` });
  }
}

module.exports = {
  MglTaskHandle,
  TaskManager,
};
