import { MongoClient } from 'mongodb'

/* The site's database (MongoDB, for example a free MongoDB Atlas cluster). It holds the customer
   accounts, their sessions, one-time links (password reset, email confirmation), the orders, and
   short-lived counts of login attempts. Nothing in it is ever written to the repository.

   MONGODB_URI   the connection string (Vercel project settings; .env.local on this computer)
   MONGODB_DB    the database's name (optional, "MiltonAguiar" when not set). The cluster can be
                 shared with another site: each site keeps to its own database.

   One connection is opened per warm function and reused by every request after the first, and
   the indexes the collections need are made the first time (making one that exists is a no-op). */
// an address still holding a placeholder ("<db_password>") counts as not set: the site carries on without accounts
const uri = () => (/<[^>]*>/.test(process.env.MONGODB_URI || '') ? '' : process.env.MONGODB_URI || '')
export const dbReady = () => Boolean(uri() || globalThis.__maTestDb)

export const db = async () => {
  if (globalThis.__maTestDb) return globalThis.__maTestDb // a stand-in, only ever set by tests
  if (!uri()) throw new Error('MONGODB_URI is not set')
  if (!globalThis.__maMongo) {
    globalThis.__maMongo = (async () => {
      const client = new MongoClient(uri(), { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 })
      await client.connect()
      const d = client.db(process.env.MONGODB_DB || 'MiltonAguiar')
      await Promise.all([
        d.collection('users').createIndex({ email: 1 }, { unique: true }),
        d.collection('sessions').createIndex({ hash: 1 }, { unique: true }),
        d.collection('sessions').createIndex({ userId: 1 }),
        d.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        d.collection('tokens').createIndex({ hash: 1 }, { unique: true }),
        d.collection('tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        d.collection('attempts').createIndex({ key: 1, at: -1 }),
        d.collection('attempts').createIndex({ at: 1 }, { expireAfterSeconds: 2 * 3600 }),
        d.collection('orders').createIndex({ ref: 1 }, { unique: true }),
        d.collection('orders').createIndex({ userId: 1, createdAt: -1 }),
        d.collection('orders').createIndex({ email: 1, createdAt: -1 }),
        d.collection('orders').createIndex({ pi: 1 }),
        d.collection('users').createIndex({ memberNo: 1 }),
      ])
      return d
    })().catch((e) => { globalThis.__maMongo = null; throw e })
  }
  return globalThis.__maMongo
}
