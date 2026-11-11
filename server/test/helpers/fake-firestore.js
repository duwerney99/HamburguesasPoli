function clone(value) {
  return value == null ? value : structuredClone(value);
}

function resolveValue(value, current) {
  if (value?.constructor?.name === 'ServerTimestampTransform') return new Date().toISOString();
  if (value?.constructor?.name === 'NumericIncrementTransform') return Number(current || 0) + Number(value.operand || 0);
  if (Array.isArray(value)) return value.map((item, index) => resolveValue(item, current?.[index]));
  if (value && typeof value === 'object' && typeof value.toDate !== 'function') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, current?.[key])]));
  }
  return value;
}

export function createFakeFirestore() {
  const documents = new Map();
  let sequence = 0;
  let transactionQueue = Promise.resolve();

  const directChildren = collectionPath => [...documents.entries()]
    .filter(([path]) => path.startsWith(`${collectionPath}/`) && path.split('/').length === collectionPath.split('/').length + 1)
    .map(([path]) => makeSnapshot(path));

  function makeSnapshot(path) {
    const value = documents.get(path);
    return { id: path.split('/').at(-1), exists: value !== undefined, data: () => clone(value), ref: docRef(path) };
  }

  function write(path, value, merge = false) {
    const current = documents.get(path) || {};
    const resolved = resolveValue(value, current);
    documents.set(path, merge ? { ...current, ...resolved } : resolved);
  }

  function docRef(path) {
    return {
      id: path.split('/').at(-1), path,
      get: async () => makeSnapshot(path),
      set: async (value, options = {}) => write(path, value, options.merge),
      create: async value => {
        if (documents.has(path)) throw Object.assign(new Error('already exists'), { code: 6 });
        write(path, value);
      },
      update: async value => {
        if (!documents.has(path)) throw new Error('not found');
        write(path, value, true);
      },
      delete: async () => documents.delete(path),
      collection: name => collectionRef(`${path}/${name}`)
    };
  }

  function query(path, filters = [], order = null, max = null) {
    return {
      where(field, operator, expected) { return query(path, [...filters, { field, operator, expected }], order, max); },
      orderBy(field, direction = 'asc') { return query(path, filters, { field, direction }, max); },
      limit(value) { return query(path, filters, order, value); },
      async get() {
        let docs = directChildren(path).filter(snapshot => filters.every(filter => {
          const actual = snapshot.data()?.[filter.field];
          return filter.operator === '==' ? actual === filter.expected : true;
        }));
        if (order) docs.sort((a, b) => {
          const av = a.data()?.[order.field]; const bv = b.data()?.[order.field];
          return (av > bv ? 1 : av < bv ? -1 : 0) * (order.direction === 'desc' ? -1 : 1);
        });
        if (max != null) docs = docs.slice(0, max);
        return { docs, size: docs.length, empty: docs.length === 0 };
      }
    };
  }

  function collectionRef(path) {
    return {
      path,
      doc: id => docRef(`${path}/${id || `auto-${++sequence}`}`),
      get: () => query(path).get(),
      where: (...args) => query(path).where(...args),
      orderBy: (...args) => query(path).orderBy(...args),
      limit: value => query(path).limit(value)
    };
  }

  function writer() {
    const operations = [];
    return {
      create(reference, value) { operations.push(() => reference.create(value)); },
      set(reference, value, options) { operations.push(() => reference.set(value, options)); },
      update(reference, value) { operations.push(() => reference.update(value)); },
      delete(reference) { operations.push(() => reference.delete()); },
      async commit() { for (const operation of operations) await operation(); }
    };
  }

  const firestore = {
    collection: name => collectionRef(name),
    batch: writer,
    runTransaction(callback) {
      const run = async () => {
        const tx = writer();
        tx.get = reference => reference.get();
        const result = await callback(tx);
        await tx.commit();
        return result;
      };
      const pending = transactionQueue.then(run, run);
      transactionQueue = pending.catch(() => {});
      return pending;
    },
    dump: () => new Map([...documents.entries()].map(([path, data]) => [path, clone(data)]))
  };
  return firestore;
}
