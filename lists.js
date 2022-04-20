const {getAuth} = require("firebase-admin/auth");
require('dotenv').config()
require('./globals')
const {
    ADD_LIST,
    UPDATE_LIST,
    REMOVE_LIST,
    USER_DB,
    USER_COLLECTION,
    ADD_PRODUCT_LIST,
    REMOVE_PRODUCT_LIST, UPDATE_LIST_NAME, LIST_PRODUCT_SELECTED
} = require("./globals");

const {ObjectId} = require("mongodb")
const {PriorityQueue} = require("@datastructures-js/priority-queue")

async function findUid(tokenId) {
    return getAuth()
        .verifyIdToken(tokenId)
        .then((decodedToken) => {
            return decodedToken.uid
        })
        .catch((error) => {
            if (error.code === 'auth/id-token-revoked') {
                console.log("force reauthenticate on client")
            } else {
                console.log("token does not exist")
            }
            return null
        });
}

async function findCollection(client) {
    return await client.db(USER_DB).collection(USER_COLLECTION);
}

async function findUser(client, id) {
    return await findCollection(client).then(async () => {
        return await client.db(USER_DB).collection(USER_COLLECTION).findOne({'uid': id})
    })
}

async function findOrCreateUser(client, id) {
    return await findCollection(client).then(async (collection) => {
        if (await collection.countDocuments({uid: id}) === 0) {
            // console.log(`added USER: ${id}`)
            await client.db(USER_DB).collection(USER_COLLECTION).insertOne({
                'uid': id,
                latitude: null,
                longitude: null,
                yearlySavings: 0.00,
                monthlySavings: 0.00,
                weeklySavings: 0.00,
                'listCollection': []
            }).then(async () => {
                let listPromises = [];
                ["breakfast", "lunch", "dinner"].forEach((async label => {
                    listPromises.push(await listManagement(client, id, ADD_LIST, {
                        id: new ObjectId().toHexString(),
                        label: label,
                        timestamp: new Date().getDate(),
                        savings: 0.00,
                        products: []
                    }))
                }))
                Promise.all(listPromises).catch((e) => console.log(e))
            })

        }
        return await findUser(client, id)
    })
}

async function listManagement(client, user_id, type, req) {
    const body = {
        query: {uid: user_id},
        document: {},
        options: {upsert: false}
    }
    switch (type) {
        case ADD_LIST : {
            body.document = {$push: {listCollection: req}}
            break
        }
        case UPDATE_LIST : {
            body.query = {uid: user_id, [`listCollection.${req.idx}`]: {$exists: true}}
            body.document = {$set: {[`listCollection.${req.idx}`]: req.body}}
            break
        }
        case UPDATE_LIST_NAME : {
            body.query = {uid: user_id, [`listCollection.${req.idx}`]: {$exists: true}}
            body.document = {$set: {[`listCollection.${req.idx}.label`]: req[`label`]}}
            break
        }
        case ADD_PRODUCT_LIST : {
            body.query = {uid: user_id, [`listCollection.${req.idx}`]: {$exists: true}}
            body.document = {
                $push: {
                    [`listCollection.${req.idx}.products`]: req.body
                },
                $set: {[`listCollection.${req.idx}.savings`]: Number((req.originalSavings + req.body.price).toFixed(2))}
            }
            break
        }
        case REMOVE_LIST : {
            body.document = {$pull: {listCollection: {id: req.listId}}}
            break
        }
        case LIST_PRODUCT_SELECTED : {
            body.query = {uid: user_id, [`listCollection.${req.idx}.products._id`]: ObjectId(req['product'])}
            body.document = {$set: {[`listCollection.${req.idx}.products.$.purchased`]: true}}
            break
        }
        case REMOVE_PRODUCT_LIST: {
            body.document = {
                $pull: {[`listCollection.${req.idx}.products`]: {_id: ObjectId(req.productId)}},
                $set: {[`listCollection.${req.idx}.savings`]: Number((req.originalSavings - req.productPrice).toFixed(2))}
            }
            break
        }
        default : {
            throw new Error("")
        }
    }
    return await client.db(USER_DB).collection(USER_COLLECTION).updateOne(
        body.query,
        body.document,
        body.options
    ).then(result => {
        console.log(result)

        return result
    })
}

async function getPreviousListPrice(client, uid, listIdx) {
    return findUser(client, uid).then(user => {
        return user['listCollection'][`${listIdx}`]['savings']
    })
}

async function getTop3Lists(client, uid) {
    return await findUser(client, uid).then((user) => {
        const compareLists = (a, b) => {
            if (a['savings'] !== null)
                return b['savings'] - a['savings']
        }
        const pq = new PriorityQueue(compareLists)
        user['listCollection'].forEach((list) => {
            pq.enqueue(list)

        })
        let top3Lists = []
        const len = (pq.size() >= 3) ? 3 : pq.size()
        for (let i = 0; i < len; i++) {
            top3Lists.push(pq.dequeue())
        }
        return top3Lists
    })
}

async function getSavings(client, uid) {
    return await findUser(client, uid).then((user) => {
        if (user == null) throw new Error("uid cannot be found")
        return {
            savings: {
                weekly: user['weeklySavings'],
                monthly: user['monthlySavings'],
                yearly: user['yearlySavings']
            }
        }
    })
}

exports.findUid = findUid
exports.findUser = findUser
exports.findOrCreateUser = findOrCreateUser
exports.listManagement = listManagement
exports.getPreviousListPrice = getPreviousListPrice
exports.getTop3Lists = getTop3Lists
exports.getSavings = getSavings