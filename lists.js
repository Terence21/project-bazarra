const {getAuth} = require("firebase-admin/auth");
require('dotenv').config()

const users = []

async function findUid(tokenId) {
    getAuth()
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
    return await client.db('BazaaraUsers').collection("UserCollection");
}

async function findUser(client, id) {
    return await findCollection(client).then(async () => {
        let user = await client.db('BazaaraUsers').collection('UserCollection').findOne({'uid': id})
        users.push(user)
        return user
    })
}

async function findOrCreateUser(client, id) {
    return await findCollection(client).then(async (collection) => {
        if (await collection.countDocuments({uid: id}) === 0) {
            console.log(`added USER: ${id}`)
            await client.db('BazaaraUsers').collection('UserCollection').insertOne({'uid': id, 'listCollection': []})
        }
        return await findUser(client, id)
    })
}

async function addList(client, id, list) {
    const query = {uid: id}
    const document = {$push: {listCollection: list}}
    const options = {upsert: false}
    await client.db('BazaaraUsers').collection('UserCollection').updateOne(
        query,
        document,
        options
    ).then(result => console.log(result))
}

async function updateList(client, id, body, idx) {
    const query = {uid: id}
    const document = {$set: {[`listCollection.${idx}`]: body}}
    const options = {upsert: false}
    await client.db('BazaaraUsers').collection('UserCollection').updateOne(
        query,
        document,
        options
    ).then(result => console.log(result))
}

async function removeList(client, uid, id) {
    const query = {uid: uid}
    const document = {$pull: {listCollection: {id: id}}}
    const options = {upsert: false}
    await client.db('BazaaraUsers').collection('UserCollection').updateOne(
        query,
        document,
        options
    ).then(result => console.log(result))
}

exports.findUid = findUid
exports.findUser = findUser
exports.findOrCreateUser = findOrCreateUser

exports.addList = addList
exports.updateList = updateList
exports.removeList = removeList

exports.users = users