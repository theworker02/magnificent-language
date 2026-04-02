class MglFuture {
  constructor(promise, options = {}) {
    this.promise = Promise.resolve(promise);
    this.label = options.label || "future";
    this.status = "pending";
    this.value = null;
    this.error = null;

    this.promise = this.promise
      .then((value) => {
        this.status = "fulfilled";
        this.value = value;
        return value;
      })
      .catch((error) => {
        this.status = "rejected";
        this.error = error;
        throw error;
      });
  }

  toString() {
    return `<future ${this.label} ${this.status}>`;
  }
}

function isFuture(value) {
  return value instanceof MglFuture;
}

async function resolveFuture(value) {
  if (value instanceof MglFuture) {
    return value.promise;
  }

  return value;
}

module.exports = {
  MglFuture,
  isFuture,
  resolveFuture,
};
