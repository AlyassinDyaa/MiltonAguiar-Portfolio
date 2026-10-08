/* A stand-in for the database, for trying customer accounts on this computer without MongoDB:
   put MONGODB_URI=memory in .env.local. Everything lives in the dev server's memory and is
   forgotten when it restarts. It does only what the site's functions ask of MongoDB (api/_db.js
   and the files that use it): find, insert, update ($set, $setOnInsert, $inc, $unset, $push,
   $pull, $addToSet), delete, count, the filters $gt, $lt, $in, $ne, $exists and $or, and dotted
   paths ("rewardCodes.first-order.code"). Never used on Vercel. */
const clone = (v) => (v === undefined ? v : structuredClone(v))
const same = (a, b) => (a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : a === b)
const isPlain = (v) => v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)
// a value down a dotted path, and setting or removing one there
const get = (doc, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc)
const put = (doc, path, value) => { const keys = path.split('.'); const last = keys.pop(); let at = doc; for (const k of keys) { if (!isPlain(at[k])) at[k] = {}; at = at[k] } at[last] = value }
const drop = (doc, path) => { const keys = path.split('.'); const last = keys.pop(); const at = keys.reduce((v, k) => (v == null ? undefined : v[k]), doc); if (at && typeof at === 'object') delete at[last] }
const test = (value, want) => {
  if (isPlain(want) && Object.keys(want).some((k) => k.startsWith('$'))) {
    return Object.entries(want).every(([op, arg]) => {
      if (op === '$gt') return value != null && +new Date(value) > +new Date(arg)
      if (op === '$lt') return value != null && +new Date(value) < +new Date(arg)
      if (op === '$in') return arg.some((x) => same(value, x))
      if (op === '$ne') return !same(value ?? null, arg ?? null)
      if (op === '$exists') return (value !== undefined) === Boolean(arg)
      throw new Error(`memory-db: ${op} is not supported`)
    })
  }
  return same(value ?? null, want ?? null)
}
const matches = (doc, filter = {}) => Object.entries(filter).every(([k, v]) => (k === '$or' ? v.some((f) => matches(doc, f)) : test(get(doc, k), v)))
// an element of an array a $pull takes out: equal to the value, or (for objects) matching it as a filter
const pulled = (el, want) => (isPlain(want) ? isPlain(el) && matches(el, want) : same(el, want))
const apply = (doc, update, inserting) => {
  for (const [k, v] of Object.entries(update.$set || {})) put(doc, k, clone(v))
  if (inserting) for (const [k, v] of Object.entries(update.$setOnInsert || {})) put(doc, k, clone(v))
  for (const [k, v] of Object.entries(update.$inc || {})) put(doc, k, (get(doc, k) || 0) + v)
  for (const k of Object.keys(update.$unset || {})) drop(doc, k)
  for (const [k, v] of Object.entries(update.$push || {})) put(doc, k, [...(Array.isArray(get(doc, k)) ? get(doc, k) : []), clone(v)])
  for (const [k, v] of Object.entries(update.$addToSet || {})) { const list = Array.isArray(get(doc, k)) ? get(doc, k) : []; put(doc, k, list.some((x) => same(x, v)) ? list : [...list, clone(v)]) }
  for (const [k, v] of Object.entries(update.$pull || {})) { const list = get(doc, k); if (Array.isArray(list)) put(doc, k, list.filter((x) => !pulled(x, v))) }
  return doc
}
const unique = { users: ['email', 'memberNo'], sessions: ['hash'], tokens: ['hash'], orders: ['ref'] }

function collection(name) {
  const rows = []
  const clash = (doc) => (unique[name] || []).some((k) => doc[k] != null && rows.some((r) => r !== doc && same(r[k], doc[k])))
  const dupe = () => Object.assign(new Error('duplicate key'), { code: 11000 })
  return {
    createIndex: async () => 'ok',
    findOne: async (filter) => clone(rows.find((r) => matches(r, filter)) || null),
    insertOne: async (doc) => { const row = clone(doc); if (clash(row)) throw dupe(); rows.push(row); return { insertedId: row._id } },
    updateOne: async (filter, update, opts = {}) => {
      let row = rows.find((r) => matches(r, filter))
      if (!row && !opts.upsert) return { matchedCount: 0, modifiedCount: 0 }
      const inserting = !row
      if (inserting) { row = Object.fromEntries(Object.entries(filter).filter(([k, v]) => !k.startsWith('$') && (typeof v !== 'object' || v instanceof Date))); rows.push(row) }
      apply(row, update, inserting)
      return { matchedCount: inserting ? 0 : 1, modifiedCount: 1, upsertedCount: inserting ? 1 : 0 }
    },
    updateMany: async (filter, update) => { const hit = rows.filter((r) => matches(r, filter)); hit.forEach((r) => apply(r, update, false)); return { matchedCount: hit.length, modifiedCount: hit.length } },
    findOneAndUpdate: async (filter, update, opts = {}) => {
      let row = rows.find((r) => matches(r, filter))
      const inserting = !row
      if (inserting && !opts.upsert) return null
      if (inserting) { row = { ...filter }; rows.push(row) }
      apply(row, update, inserting)
      return clone(row)
    },
    deleteOne: async (filter) => { const i = rows.findIndex((r) => matches(r, filter)); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 } },
    deleteMany: async (filter) => { let n = 0; for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], filter)) { rows.splice(i, 1); n++ } return { deletedCount: n } },
    countDocuments: async (filter) => rows.filter((r) => matches(r, filter)).length,
    find: (filter) => {
      let list = rows.filter((r) => matches(r, filter))
      const cursor = {
        sort: (spec) => { const [[k, dir]] = Object.entries(spec); list = [...list].sort((a, b) => (+new Date(a[k]) - +new Date(b[k])) * dir); return cursor },
        limit: (n) => { list = list.slice(0, n); return cursor },
        toArray: async () => clone(list),
      }
      return cursor
    },
  }
}

export function memoryDb() {
  const all = {}
  return { collection: (name) => (all[name] ||= collection(name)) }
}
