const express = require('express')
const {MongoClient, ObjectID, ObjectId} = require("mongodb")
const {initializeApp, applicationDefault} = require('firebase-admin/app')
const {getAuth, UserRecord} = require("firebase-admin/auth")
const admin = require('firebase-admin')
var serviceAccount = require("./bazaara-342116-firebase-adminsdk-bazyf-419376ebb8.json")
const lists = require('./lists')
const {users, findUser, addUser, findOrCreateUser, addList, updateList, removeList} = require("./lists");
require('dotenv').config()

const port = process.env.PORT

const app = express()
app.use(express.static('public'))

const uri = process.env.MONGODB;
const client = new MongoClient(uri)
const loadClient = async () => {
    await client.connect()
}
loadClient().catch(console.error)
run().catch(console.error)

initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FBProjectID,
});

const listAllUsers = (nextPageToken) => {
    const userArr = []
    getAuth()
        .listUsers(1000, nextPageToken)
        .then(async (listUsersResult) => {
            for (const userRecord of listUsersResult.users) {
                const user = await findOrCreateUser(client, userRecord.uid)
                userArr.push(user)
            }
            if (listUsersResult.pageToken) {
                listAllUsers(listUsersResult.pageToken)
            }
            return userArr
        })
        .then((arr) => {
            console.log(users)
        })
        .catch((error) => {
            console.log('Error listing users:', error);
        });
};

app.listen(port, () => {
    listAllUsers()
    console.log(`Project ${process.env.BAZARRA} listening on port ${port}`)
})

app.use(express.json())

app.get('/', (req, res) => {
    res.send({"status": 200, "message": 'Hello From Bazarra'})
})

app.get('/validEmail/:email', (req, res) => {
    let email = req.params.email

    getAuth()
        .getUserByEmail(email)
        .then((person) => {
            res.send({
                "status": 200,
                "user": person.toJSON()
            })
        })
        .catch(() => {
            console.log(`invalid email: ${email}`)
            res.send({"status": 400, "message": "invalid email"})
        });
})

app.get('/validToken/:idToken', (req, res) => {
    let idToken = req.params.idToken
    let checkRevoked = true;

    getAuth()
        .verifyIdToken(idToken, checkRevoked)
        .then((decodedToken) => {
            const uid = decodedToken.uid
            console.log("valid token")
            res.send({"status": 200, "tokenState": true, "uid": uid})
        })
        .catch((error) => {
            if (error.code === 'auth/id-token-revoked') {
                console.log("force reauthenticate on client")
                res.send({"status": 200, "tokenState": false})
            } else {
                console.log("token does not exist")
                res.send({"status": 400, "message": "token does not exist"})
            }
        });
})

app.get('/revoke/:uid', (req, res) => {
    let uid = req.params.uid

    getAuth()
        .revokeRefreshTokens(uid)
        .then(() => {
            return getAuth().getUser(uid);
        })
        .then((userRecord) => {
            return new Date(userRecord.tokensValidAfterTime).getTime() / 1000;
        })
        .then((timestamp) => {
            console.log(`Token revoked at: ${timestamp}`);
            res.send({"status": 200})
        })
        .catch(() => {
            console.log("Failed to revoke token")
            res.send({"status": 400, "message": "Failed to revoke token, does not exist"})
        })
})


// -------- LISTS -----------
app.get('/lists/:uid', (async (req, res) => {
    let uid = req.params.uid
    await findUser(client, uid).then(user => {
        res.send(user.listCollection)
    }).catch(reason => {
        console.log(reason)
        res.sendStatus(400)
    })
}))

app.post('/lists/add/:uid', (async (req, res) => {
    try {
        const id = req.params.uid
        const body = req.body
        const list = {id: new ObjectId().toHexString(), body}
        await addList(client, id, list).then(() => {
            res.sendStatus(200)
        }).catch((e) => {
            console.log(e)
            res.send(400)
        })

    } catch (e) {
        console.log(e)
        res.send(400)
    }
}))

app.post('/lists/update/:uid/listindex/:idx', (async (req, res) => {
    try {
        const id = req.params['uid']
        const idx = req.params['idx']
        const body = req.body
        await updateList(client, id, body, idx).then(() => {
            res.sendStatus(200)
        }).catch((e) => {
            console.log(e)
            res.send(400)
        })

    } catch (e) {
        console.log(e)
        res.send(400)
    }
}))

app.delete('/lists/delete/:uid/list/:id', (async (req, res) => {
    try {
        const uid = req.params['uid']
        const listid = req.params['id']
        //   const body = req.body
        await removeList(client, uid, listid).then(() => {
            res.sendStatus(200)
        }).catch((e) => {
            console.log(e)
            res.send(400)
        })

    } catch (e) {
        console.log(e)
        res.send(400)
    }
}))

async function run() {
    try {
        await (await client).connect();
        await logDatabaseConnections(client)
        console.log("Database Connection Successful")
    } catch (e) {
        console.log('client database cluster connection failed')
        console.log(e.message)
    }
}

async function logDatabaseConnections(client) {
    let databaseConnections = await client.db().admin().listDatabases()

    console.log("Databases:");
    databaseConnections.databases.forEach(db => console.log(` - ${db.name}`));
}


process.on('exit', async () => {
    await client.close()
})