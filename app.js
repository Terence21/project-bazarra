require('dotenv').config()
const express = require('express')
const {MongoClient, ObjectId} = require("mongodb")

const {initializeApp} = require('firebase-admin/app')
const {getAuth} = require("firebase-admin/auth")
const admin = require('firebase-admin')
const serviceAccount = require("./bazaara-342116-firebase-adminsdk-bazyf-419376ebb8.json");

const {
    findUser, findOrCreateUser, listManagement, getTop3Lists
} = require("./lists.js");
const {
    productSuggestByName,
    searchProductById,
    loadAllProducts,
    pageOfProducts,
    addProduct,
    queryProduct, addProductToList, removeProductFromList
} = require('./products')
const {ADD_LIST, REMOVE_LIST, UPDATE_LIST} = require('./globals')
const {typeValidator, updateLocation} = require("./home");

const port = process.env.PORT
const uri = process.env.MONGODB;

const app = express()
const client = new MongoClient(uri)

app.use(express.static('public'))
app.use(express.json())

// ------ INITIALIZATION ------
let products = []
initializeApp({
    credential: admin.credential.cert(serviceAccount), projectId: process.env.FBProjectID,
});

app.listen(port, async () => {
    listAllUsers()
    runMongoConnection().then(async () => {
        products = await loadAllProducts(client)
    }).catch(console.error)
    console.log(`Project ${process.env.BAZARRA} listening on port ${port}`)
})

// ------ USER -------
app.get('/', (req, res) => {
    res.send({status: 200, message: 'Hello From Bazarra'})
})

app.get('/validEmail/:email', (req, res, next) => {
    try {
        let email = req.params.email
        getAuth()
            .getUserByEmail(email)
            .then((person) => {
                res.send({
                    status: 200, user: person.toJSON()
                })
            })
            .catch(() => {
                console.log(`invalid email: ${email}`)
                next({status: 404, message: "invalid email"})
            });
    } catch (e) {
        next({status: 400, message: e.message})
    }
})

app.get('/validToken/:idToken', (req, res, next) => {
    try {
        let idToken = req.params.idToken
        let checkRevoked = true;

        getAuth()
            .verifyIdToken(idToken, checkRevoked)
            .then((decodedToken) => {
                const uid = decodedToken.uid
                console.log("valid token")
                res.send({"status": 200, tokenState: true, "uid": uid})
            })
            .catch((error) => {
                if (error.code === 'auth/id-token-revoked') {
                    console.log("force reauthenticate on client")
                    res.send({status: 401, tokenState: false})
                } else {
                    console.log("token does not exist")
                    next({status: 404, message: "token does not exist"})
                }
            });
    } catch (e) {
        next({status: 400, message: e.message})
    }
})

app.get('/revoke/:uid', (req, res, next) => {
    try {
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
                res.send({status: 200})
            })
            .catch(() => {
                console.log("Failed to revoke token")
                next({status: 404, message: "Failed to revoke token, does not exist"})
            })
    } catch (e) {
        next({status: 400, message: e.message})
    }
})


// -------- LISTS -----------
app.get('/lists/:uid', (async (req, res, next) => {
    try {
        let uid = req.params.uid
        findUser(client, uid).then(user => {
            res.send(user.listCollection)
        }).catch(next)
    } catch (e) {
        next({status: 400, message: e.message})
    }
}))

app.post('/lists/add/:uid', (async (req, res, next) => {
    try {
        const id = req.params.uid
        const body = req.body

        // if valid body request format
        if ((typeof (body.label) == "string" && typeof (body.timestamp) == "number" && typeof (body.savings) == "number" && typeof (body.products) == "object")) {
            const list = {id: new ObjectId().toHexString(), body}
            listManagement(client, id, ADD_LIST, {list: list}).then(() => {
                res.sendStatus(200)
            }).catch(next)
        } else {
            next({status: 400, message: `INVALID REQUEST BODY USER: ${id} => ${body}`})
        }
    } catch (e) {
        next({status: 400, message: "invalid uid"})
    }
}))

app.post('/lists/update/:uid/listIndex/:idx', (async (req, res, next) => {
    try {
        const id = req.params['uid']
        const idx = req.params['idx']
        const body = req.body

        // if valid body request format
        if ((typeof (body.label) == "string" && typeof (body.timestamp) == "number" && typeof (body.savings) == "number" && typeof (body.products) == "object")) {
            await listManagement(client, id, UPDATE_LIST, {idx: idx, body: body}).then((result) => {
                if (result.modifiedCount > 0) {
                    res.send({status: 200})
                } else {
                    next({status: 400, message: "List not updated, invalid list type or same list"})
                }
            }).catch(next)
        } else {
            next({status: 400, message: `INVALID REQUEST BODY USER: ${id} => ${body}`})
        }
    } catch (e) {
        next({status: 400, message: e.message})
    }
}))

app.post('/lists/add/:uid/product', (async (req, res, next) => {
    try {
        const uid = req.params['uid']
        const body = req.body
        const productId = body.productId
        const listIdx = body.listIdx

        addProductToList(client, uid, listIdx, productId).then(result => {
            if (result.modifiedCount > 0) {
                res.send({status: 200})
            } else {
                next({status: 400, message: "List not updated, invalid list/product type or same list/product"})
            }
        }).catch(next)
    } catch (e) {
        next({status: 400, message: e.message})
    }
}))

app.delete('/lists/delete/:uid/product', (async (req, res, next) => {
    try {
        const uid = req.params['uid']
        const body = req.body
        removeProductFromList(client, uid, body['listIdx'], body['productId']).then(result => {
            if (result.modifiedCount > 0) {
                res.send({status: 200})
            } else {
                next({status: 400, message: "List not updated, invalid list/product type or same list/product"})
            }
        }).catch(next)
    } catch (e) {
        console.log(e)
        next({status: 400, message: e.message})
    }
}))

app.delete('/lists/delete/:uid/list/:id', (async (req, res, next) => {
    try {
        const uid = req.params['uid']
        const listId = req.params['id']
        listManagement(client, uid, REMOVE_LIST, {listId: listId}).then((result) => {
            if (result.modifiedCount > 0) {
                res.send({status: 200})
            } else {
                next({status: 400, message: "List not removed, invalid list type or same list"})
            }
        }).catch(next)
    } catch (e) {
        next({status: 400, message: e.message})
    }
}))

app.get('/lists/top3/:uid', (req, res, next) => {
    try {
        getTop3Lists(client, req.params['uid']).then(result => {
            res.send({status: 200, message: {top3Lists: result}})
        }).catch(next)
    } catch (e) {
        next({status: 400, message: e.message})
    }
})

// ----- PRODUCTS -----
app.get('/products', (async (req, res, next) => {
    loadAllProducts(client).then(result => {
        res.send(result)
    }).catch(next)
}))
app.get('/products/id/:productId', (async (req, res, next) => {
    try {
        const productId = req.params['productId']
        searchProductById(client, productId).then(result => {
            res.send(result)
        }).catch(next)
    } catch (e) {
        next({status: 400, message: e.message})
    }
}))

app.get('/products/suggest', (async (req, res, next) => {
    try {
        const prefix = req.query.prefix
        await productSuggestByName(client, prefix).then(result => {
            res.send({status: 200, message: result})
        }).catch(next)
    } catch (e) {
        next({status: 400, message: e.message})
    }
}))

app.get('/products/default/:page', ((req, res, next) => {
    try {
        const page = req.params['page']
        let result = pageOfProducts(page, products)
        if (result === -1) next({status: 404})
        else res.send({status: 200, message: result})
    } catch (e) {
        next({status: 400, message: e.message})
    }
}))

app.get('/products/search', (async (req, res, next) => {
    queryProduct(client, req.query).then(result => {
        res.send({status: 200, query: result})
    }).catch(next)
}))

app.post('/products/add', async (req, res, next) => {
    addProduct(client, req.body).then(() => {
        res.send({status: 200})
    }).catch(next)
})

// ---------- USERS -----------------
app.post('/user/location', (req, res, next) => {
    const body = req.body
    const lat = body['latitude']
    const lon = body['longitude']
    const userId = body['uid']
    if (typeValidator({"number": [lat, lon], "string": [userId]})) {
        updateLocation(client, lat, lon, userId).then(() => {
            res.send({status: 200, message: "user location updated"})
        }).catch(next)
    } else {
        res.send({status: 400, message: "invalid request body"})
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
            console.log(listUsersResult)
        }).catch((error) => {
        console.log('Error fetching users:', error);
    });
};

process.on('exit', async () => {
    await client.close()
})

// ------ MIDDLEWARE ------ (ERROR HANDLING MIDDLEWARE MUST BE AT BOTTOM OF APP.JS)
app.use(function (err, req, res, next) {
    console.error(err);
    if (err.message !== undefined) {
        res.send({status: 400, message: err.message})
    } else {
        res.send({status: 400, message: "Invalid request format"})
    }
});