require('dotenv').config()
const express = require('express')
const cors = require('cors');
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
    queryProduct, addProductToList, removeProductFromList, getAverageOfUpc, findUpcProductsArray,
    sortProductArrayByColumn, updateProductPrice
} = require('./products')
const {ADD_LIST, REMOVE_LIST, UPDATE_LIST, UPDATE_LIST_NAME, LIST_PRODUCT_SELECTED} = require('./globals')
const {typeValidator, updateLocation, updateSavings} = require("./home");
const {getSavings} = require("./lists");
const bodyParser = require("express");

const port = process.env.PORT
const uri = process.env.MONGODB;

const app = express()
const client = new MongoClient(uri)

app.use(express.static('public'))
cors({credentials: true, origin: true})
app.use(cors())
app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({extended: true})) // for parsing application/x-www-form-urlencoded

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
app.use((req, res, next) => {
    const idToken = req.headers['authorization']
    if (idToken === "bazaara-integration-test") {
        next()
    } else {
        try {
            let checkRevoked = true;
            // comments left for local debugging
            getAuth()
                .verifyIdToken(idToken, checkRevoked)
                .then(async (decodedToken) => {
                    const uid = decodedToken.uid
                    await findOrCreateUser(client, uid).then(() => next())
                    // console.log(`valid token for user: ${uid}`)
                })
                .catch((error) => {
                    if (error.code === 'auth/id-token-revoked') {
                        // console.log("force reauthenticate on client")
                        res.send({status: 401, tokenState: false, message: "force reauthenticate on client"})
                    } else {
                        // console.log("token does not exist")
                        next({status: 404, message: "token does not exist"})
                    }
                })

        } catch (e) {
            next({status: 400, message: "check invalid header for authorization and idToken"})
        }
    }
})

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
                    status: 200, message: person.toJSON()
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
                res.send({status: 200, message: "token revoked for user"})
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
            res.send({status: 200, message: user.listCollection})
        }).catch(next)
    } catch (e) {
        console.log("failed")
        next({status: 400, message: e.message})
    }
}))

app.post('/lists/add/:uid', (async (req, res, next) => {
    try {
        const id = req.params.uid
        const body = req.body
        body.id = new ObjectId().toHexString()
        // if valid body request format
        if ((typeof (body.label) == "string" && typeof (body.timestamp) == "number" && typeof (body.savings) == "number" && typeof (body.products) == "object")) {
            listManagement(client, id, ADD_LIST, body).then(() => {
                res.send({status: 200, message: "list added"})
            }).catch(next)
        } else {
            next({status: 400, message: `INVALID REQUEST BODY USER: ${id} => ${body}`})
        }
    } catch (e) {
        next({status: 400, message: "invalid uid"})
    }
}))

app.post('/lists/update/:uid/listIndex/:idx/label', (req, res, next) => {
    try {
        const uid = req.params['uid']
        const idx = req.params['idx']
        const body = req.body
        console.log(typeof uid)
        console.log(typeof idx)
        console.log(typeof body['label'])
        listManagement(client, uid, UPDATE_LIST_NAME, {idx: idx, label: body['label']}).then(result => {
            console.log(result)
            if (result['matchedCount'] === 0) {
                res.send({status: 404, message: `list ${idx} for user ${uid} could not be found`})
            } else {
                res.send({status: 200, message: `list name changed to: ${body['label']}`})
            }
        }).catch(next)

    } catch (e) {
        next({status: 404, message: "invalid request, could not be found"})
    }
})

/**
 * grab all with upc code
 * calculate average price
 * weekly, monthly, yearly
 * weekly savings
 */
app.post('/lists/update/:uid/listIndex/:idx/selected', (req, res, next) => {
    const body = req['body']
    const uid = req.params['uid']
    const idx = req.params['idx']
    const productId = body['productId']
    searchProductById(client, productId).then(async result => {
        const res_price = result['price']
        return getAverageOfUpc(client, result['upc_code']).then(average => {
            return (res_price < average) ? average - res_price : 0
        })
    }).then(async savings => {
        updateSavings(client, savings, uid).catch(e => console.log(e))
    })
    listManagement(client, uid, LIST_PRODUCT_SELECTED, {idx: idx, product: productId}).then(result => {
        console.log(`matchedCount: ${result['matchedCount'] === 0}`)
        if (result['matchedCount'] === 0) {
            res.send({
                status: 404,
                message: `product ${productId}, for list ${idx}, for user ${uid} could not be found`
            })
        } else {
            res.send({status: 200, message: "Thank you for saving with Bazaara"})
        }
    }).catch(next)
})

app.post('/lists/update/:uid/listIndex/:idx', (async (req, res, next) => {
    try {
        const id = req.params['uid']
        const idx = req.params['idx']
        const body = req.body
        body.id = new ObjectId().toHexString()
        // if valid body request format
        if ((typeof (body.label) == "string" && typeof (body.timestamp) == "number" && typeof (body.savings) == "number" && typeof (body.products) == "object")) {
            await listManagement(client, id, UPDATE_LIST, {idx: idx, body: body}).then((result) => {
                if (result.modifiedCount > 0) {
                    res.send({status: 200, message: "list updated"})
                } else {
                    next({status: 404, message: "List not updated, invalid list type, list idx or same list"})
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
                res.send({status: 200, message: "product added to list"})
            } else {
                next({status: 404, message: "List not updated, invalid list/product type or same list/product"})
            }
        }).catch(next)
    } catch (e) {
        next({status: 400, message: e.message})
    }
}))

app.post('/lists/delete/:uid/product', (async (req, res, next) => {
    try {
        const uid = req.params['uid']
        const body = req.body
        removeProductFromList(client, uid, body['listIdx'], body['productId']).then(result => {
            if (result.modifiedCount > 0) {
                res.send({status: 200, message: "product removed from list"})
            } else {
                next({status: 404, message: "List not updated, invalid list/product type or same list/product"})
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
                res.send({status: 200, message: "list removed"})
            } else {
                next({status: 404, message: "List not removed, invalid list type or same list"})
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
        res.send({status: 200, message: result})
    }).catch(next)
}))
app.get('/products/id/:productId', (async (req, res, next) => {
    try {
        const productId = req.params['productId']
        searchProductById(client, productId).then(result => {
            res.send({status: 200, message: result})
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
        if (result === -1) next({status: 404, message: "invalid page"})
        else res.send({status: 200, message: result})
    } catch (e) {
        next({status: 400, message: e.message})
    }
}))

app.get('/products/search', (async (req, res, next) => {
    queryProduct(client, req.query).then(result => {
        res.send({
            status: 200,
            message: result['result_arr'],
            total: result['total'],
            lower: result['lower_bound'],
            upper: result['upper_bound'],
            page_size: result['page_size'],
        })
    }).catch(e => {
        console.log(e)
        next()
    })
}))

app.post('/products/add', async (req, res, next) => {
    addProduct(client, req.body).then(() => {
        res.send({status: 200, message: "product added"})
    }).catch(next)
})

app.post('/products/barcode/add', (req, res, next) => {
    const body = req['body']
    const upc = String(body['upc_code'])
    const price = Number(body['price'])
    if (typeValidator({"number": [price]})) {
        findUpcProductsArray(client, upc).then(arr => {
            if (arr.length === 1) {
                updateProductPrice(client, upc, price).then(result => {
                    console.log(result)
                })
            }
        }).catch(next)
        res.send({status: 200, message: "Thank you for contributing to our dataset!!"})
    } else {
        next({status: 400, message: "invalid request body"})
    }
})

// ---------- USERS -----------------
app.post('/user/:uid/location', (req, res, next) => {
    const body = req.body
    const lat = body['latitude']
    const lon = body['longitude']
    const userId = req.params['uid']
    updateLocation(client, lat, lon, userId).then((result) => {
        if (result['matchedCount'] === 0) {
            res.send({status: 404, message: "no user with uid found"})
        } else {
            res.send({status: 200, message: "user location updated"})
        }
    }).catch(next)
})

app.get('/user/:uid/savings', (req, res, next) => {
    getSavings(client, req.params['uid']).then(result => {
        res.send({status: 200, message: result})
    }).catch(next)
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
            // console.log(listUsersResult)
        }).catch((error) => {
        console.log('Error fetching users:', error);
    });
};

process.on('exit', async () => {
    await client.close()
})

// ------ MIDDLEWARE ------ (ERROR HANDLING MIDDLEWARE MUST BE AT BOTTOM OF APP.JS)
app.use(function (err, req, res, next) {
    if (err.message !== undefined) {
        res.send({status: 400, message: err.message})
    } else {
        res.send({status: 400, message: "Invalid request format"})
    }
});