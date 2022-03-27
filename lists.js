const {getAuth} = require("firebase-admin/auth");
require('dotenv').config()
require('./globals')
const {ADD_LIST, UPDATE_LIST, REMOVE_LIST, USER_DB, USER_COLLECTION} = require("./globals");

const users = []

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
        let user = await client.db(USER_DB).collection(USER_COLLECTION).findOne({'uid': id})
        users.push(user)
        return user
    })
}

async function findOrCreateUser(client, id) {
    return await findCollection(client).then(async (collection) => {
        if (await collection.countDocuments({uid: id}) === 0) {
            console.log(`added USER: ${id}`)
            await client.db(USER_DB).collection(USER_COLLECTION).insertOne({'uid': id, 'listCollection': []})
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
            body.document = {$push: {listCollection: req.list}}
            break
        }
        case UPDATE_LIST : {
            body.query = {uid: user_id, [`listCollection.${req.idx}`]: {$exists: true}}
            body.document = {$set: {[`listCollection.${req.idx}.body`]: req.body}}
            break
        }
        case REMOVE_LIST : {
            body.document = {$pull: {listCollection: {id: req.listId}}}
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

exports.findUid = findUid
exports.findUser = findUser
exports.findOrCreateUser = findOrCreateUser
exports.listManagement = listManagement

exports.users = users