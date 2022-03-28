require('dotenv').config()
const express = require('express')
const {MongoClient, ObjectId} = require("mongodb")

const {initializeApp} = require('firebase-admin/app')
const {getAuth} = require("firebase-admin/auth")
const admin = require('firebase-admin')
const serviceAccount = require("./bazaara-342116-firebase-adminsdk-bazyf-419376ebb8.json");

const {
    users, findUser, findOrCreateUser, listManagement
} = require("./lists");
const {productSuggestByName, searchProductByName, loadAllProducts, pageOfProducts, addProduct} = require('./products')
const {ADD_LIST, REMOVE_LIST, UPDATE_LIST} = require('./globals')

const port = process.env.PORT
const uri = process.env.MONGODB;

const app = express()
const client = new MongoClient(uri)


let products = []
initializeApp({
    credential: admin.credential.cert(serviceAccount), projectId: process.env.FBProjectID,
});

app.use(express.static('public'))
app.use(express.json())
app.listen(port, async () => {
    //   listAllUsers()
    runMongoConnection().then(async () => {
        products = await loadAllProducts(client)
    }).catch(console.error)
    console.log(`Project ${process.env.BAZARRA} listening on port ${port}`)
})

// ------ USER -------
app.get('/', (req, res) => {
    res.send({"status": 200, "message": 'Hello From Bazarra'})
})

app.get('/validEmail/:email', (req, res) => {
    let email = req.params.email

    getAuth()
        .getUserByEmail(email)
        .then((person) => {
            res.send({
                "status": 200, "user": person.toJSON()
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
        res.send({status: 400, "message": reason.message})
    })
}))

app.post('/lists/add/:uid', (async (req, res) => {
    try {
        const id = req.params.uid
        const body = req.body

        // if valid body request format
        if ((typeof (body.label) == "string" && typeof (body.timestamp) == "number" && typeof (body.savings) == "number" && typeof (body.products) == "object")) {
            const list = {id: new ObjectId().toHexString(), body}
            await listManagement(client, id, ADD_LIST, {list: list}).then(() => {
                res.sendStatus(200)
            }).catch((e) => {
                console.log(e)
                res.send(400)
            })
        } else {
            console.log(`INVALID REQUEST BODY USER: ${id} => ${body}`)
            res.send({status: 400, message: `INVALID REQUEST BODY USER: ${id} => ${body}`})
        }
    } catch (e) {
        console.log(e)
        res.send({status: 400, "message": e.message})
    }
}))

app.post('/lists/update/:uid/listIndex/:idx', (async (req, res) => {
    try {
        const id = req.params['uid']
        const idx = req.params['idx']
        const body = req.body

        // if valid body request format
        if ((typeof (body.label) == "string" && typeof (body.timestamp) == "number" && typeof (body.savings) == "number" && typeof (body.products) == "object")) {
            await listManagement(client, id, UPDATE_LIST, {idx: idx, body: body}).then((result) => {
                if (result.modifiedCount > 0) {
                    res.sendStatus(200)
                } else {
                    res.send({status: 400, "message": "List not updated, invalid list type or same list"})
                }
            }).catch((e) => {
                console.log(e)
                res.send({status: 400, "message": e.message})
            })

        } else {
            console.log(`INVALID REQUEST BODY USER: ${id} => ${body}`)
            res.send({status: 400, message: `INVALID REQUEST BODY USER: ${id} => ${body}`})
        }

    } catch (e) {
        console.log(e)
        res.send({status: 400, "message": e.message})
    }
}))

app.delete('/lists/delete/:uid/list/:id', (async (req, res) => {
    try {
        const uid = req.params['uid']
        const listId = req.params['id']
        listManagement(client, uid, REMOVE_LIST, {listId: listId}).then((result) => {
            if (result.modifiedCount > 0) {
                res.sendStatus(200)
            } else {
                res.send({status: 400, "message": "List not removed, invalid list type or same list"})
            }
        }).catch((e) => {
            console.log(e)
            res.send({status: 400, "message": e.message})
        })

    } catch (e) {
        console.log(e)
        res.send({status: 400, "message": e.message})
    }
}))

// ----- PRODUCTS -----
app.get('/products', (async (req, res) => {
    loadAllProducts(client).then(result => {
        console.log(result)
        res.send(result)
    }).catch(e => {
        console.log(e)
        res.send(400)
    })
}))
app.get('/products/:productId', (async (req, res) => {
    try {
        const productId = req.params['productId']
        searchProductByName(client, productId).then(result => {
            console.log(result)
            res.send(result)
        }).catch(e => {
            console.log(e)
            res.send(405)
        })
    } catch (e) {
        console.log(e)
        res.send(400)
    }
}))

app.get('/products/search', (async (req, res) => {
    try {
        const prefix = req.query.prefix
        await productSuggestByName(client, prefix).then(result => {
            console.log(result)
            res.send(result)
        }).catch(e => {
            console.log(e)
            res.send(405)
        })
    } catch (e) {
        console.log(e)
        res.send(400)
    }
}))

app.get('/products/search/:page', (async (req, res) => {
    try {
        const page = req.params['page']
        let result = pageOfProducts(page, products)
        console.log(result.message)
        res.send({status: 400, "message": result.message})
    } catch (e) {
        console.log(e)
        res.send({status: 400, "message": e.message})
    }
}))

app.post('/products/add', async (req, res) => {
    try {
        addProduct(client, req.body).then(() => {
            res.send({status: 200})
        }).catch(e => {
            console.log(e.message)
            res.send({status: 400, "message": e.message})
        })
    } catch (e) {
        console.log(e.message)
        res.send({status: 400, "message": e.message})
    }
})

async function logDatabaseConnections(client) {
    let databaseConnections = await client.db().admin().listDatabases()

    console.log("Databases:");
    databaseConnections.databases.forEach(db => console.log(` - ${db.name}`));
}

async function runMongoConnection() {
    try {
        await (await client).connect();
        await logDatabaseConnections(client)
        console.log("Database Connection Successful")
    } catch (e) {
        console.log('client database cluster connection failed')
        console.log(e.message)
    }
}

const listAllUsers = (nextPageToken) => {
    getAuth()
        .listUsers(1000, nextPageToken)
        .then(async (listUsersResult) => {
            for (const userRecord of listUsersResult.users) {
                await findOrCreateUser(client, userRecord.uid)
            }
            if (listUsersResult.pageToken) {
                listAllUsers(listUsersResult.pageToken)
            }
        })
        .then(() => {
            // users array stored in lists.js
            console.log(users)
        })
        .catch((error) => {
            console.log('Error listing users:', error);
        });
};

process.on('exit', async () => {
    await client.close()
})