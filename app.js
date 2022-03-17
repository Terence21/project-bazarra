const express = require('express')
const {MongoClient} = require("mongodb")
const {initializeApp, applicationDefault} = require('firebase-admin/app')
const {getAuth} = require("firebase-admin/auth")
const admin = require('firebase-admin')
var serviceAccount = require("./bazaara-342116-firebase-adminsdk-bazyf-419376ebb8.json")

require('dotenv').config();

var router = express.Router()
const app = express()
const port = process.env.PORT

initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FBProjectID,
});

const listAllUsers = (nextPageToken) => {

    getAuth()
        .listUsers(1000, nextPageToken)
        .then((listUsersResult) => {
            listUsersResult.users.forEach((userRecord) => {
                console.log('user', userRecord.toJSON())
            });
            if (listUsersResult.pageToken) {
                // List next batch of users.
                listAllUsers(listUsersResult.pageToken)
            }
        })
        .catch((error) => {
            console.log('Error listing users:', error);
        });
};

app.listen(port, () => {
    listAllUsers()
    console.log(`Project ${process.env.BAZARRA} listening on port ${port}`)
})



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
            res.send({"status": 400})
        });
})

app.get('/validToken/:idToken', (req, res) => {
    let idToken = req.params.idToken
    let checkRevoked = true;

    getAuth()
        .verifyIdToken(idToken, checkRevoked)
        .then((payload) => {
            console.log("valid token")
            res.send({"status": 200})
        })
        .catch((error) => {
            if (error.code === 'auth/id-token-revoked') {
                console.log("force reauthenticate on client")
            } else {
                console.log("token does not exist")
            }
            res.send({"status": 400})
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
            res.send({"status": 400})
        })
})

const uri = process.env.MONGODB;
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
    } catch {
        console.log('client database cluster connection failed')
    } finally {
        await client.close();
    }
}

run().catch(console.error)

async function logDatabaseConnections(client) {
    let databaseConnections = await client.db().admin().listDatabases()

    console.log("Databases:");
    databaseConnections.databases.forEach(db => console.log(` - ${db.name}`));
}