const {PRODUCTS_DB, PRODUCTS_COLLECTION, ADD_PRODUCT_LIST, REMOVE_PRODUCT_LIST} = require('./globals')
const {ObjectId} = require("mongodb");
const {listManagement, getPreviousListPrice} = require("./lists.js");
const {distanceToStore, getLastLocation} = require("./home");
const {findUser} = require("./lists");
const PRODUCT_INCREMENT = 10
const PRODUCT_MAX = 1000
const INCREMENT_MAX = (PRODUCT_MAX / PRODUCT_INCREMENT) - 1

async function loadAllProducts(client) {
    const collection = client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION)
    let cursor = await collection.find().limit(PRODUCT_MAX)
    let results = cursor.toArray()
    console.log(results)
    return results
}

async function getAverageOfUpc(client, upc) {
    return findUpcProductsArray(client, upc).then(async results => {
        let total = 0
        let count = 0
        for (let item in await results) {
            total += results[item]['price']
            count++
        }
        return total / count
    })
}

async function findUpcProductsArray(client, upc) {
    const collection = client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION)
    let cursor = await collection.find({upc_code: upc})
    return cursor.toArray()
}

async function updateProductPrice(client, upc, price) {
    client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION).updateOne(
        {upc_code: upc},
        {$set: {price: price}},
        {upsert: false}
    ).then(result => {
        return result
    })
}

function pageOfProducts(page, arr) {
    if (page < 1 || page > INCREMENT_MAX) return -1
    return arr.slice((PRODUCT_INCREMENT * (page - 1)), (PRODUCT_INCREMENT * page))
}

async function productSuggestByName(client, label) {
    const collection = client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION)
    return await collection.aggregate([
        {
            "$search": {
                "autocomplete": {
                    "query": `${label}`,
                    "path": "name",
                    "fuzzy": {
                        "maxEdits": 2,
                        "prefixLength": 1
                    }
                }
            }
        }
    ]).toArray()
}

async function addProduct(client, body) {
    if (validProduct(body)) {
        client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION).insertOne(body)
    } else {
        throw new Error("Invalid product type")
    }
}

async function addProductToList(client, user_id, listIdx, productId) {
    if (validListProduct(user_id, listIdx, productId)) {
        let product = await searchProductById(client, productId)
        product['purchased'] = false
        if (product === null) throw new Error("Product DNE")
        return await getPreviousListPrice(client, user_id, listIdx).then((price) => listManagement(client, user_id, ADD_PRODUCT_LIST, {
            idx: listIdx,
            body: product,
            originalSavings: price
        }))
    } else {
        throw new Error("Invalid Request type, productId or uid is not valid")
    }
}

// you have to remove all associated with productId, not just one
async function removeProductFromList(client, user_id, listIdx, productId) {
    if (validListProduct(user_id, listIdx, productId)) {
        return await getPreviousListPrice(client, user_id, listIdx).then(async (price) => {
            return await searchProductById(client, productId).then((product) => listManagement(client, user_id, REMOVE_PRODUCT_LIST, {
                idx: listIdx,
                productId: productId,
                originalSavings: price,
                productPrice: product.price
            }))
        })
    } else {
        throw new Error("Invalid Request Type, product not valid")
    }
}

async function searchProductById(client, productId) {
    const collection = await client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION)
    return await collection.findOne({_id: ObjectId(productId)})
}

async function queryProduct(client, query) {
    const builder = {}
    let dist_obj = {distance: 0}
    if (query.hasOwnProperty("name")) builder.name = {$regex: query.name}
    if (query.hasOwnProperty("price")) builder.price = parseFloat(query.price)
    if (query.hasOwnProperty("store")) builder["store.name"] = {$regex: query.store}
    if (query.hasOwnProperty("upc_code")) builder.upc_code = parseInt(query.upc_code)
    let result_arr = await client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION).find(builder).toArray()
    if (query.hasOwnProperty("sort") && query.hasOwnProperty("order")) {
        if (query['sort'] === "location" && query.hasOwnProperty("uid")) {
            result_arr = await getLastLocation(client, query['uid']).then(result => {
                if (typeof (result) === "undefined") throw new Error("lat/lon not provided by client or cannot find user with uid")
                return sortProductArrayByColumn(result_arr, "location", result)
            })
        } else {
            result_arr = sortProductArrayByColumn(await result_arr, query['sort'])
        }
        if (parseInt(query['order']) === 1) result_arr = await result_arr.reverse()
    }

    await findUser(client, query['uid']).then(user => {
        console.log(user)
        if (typeof user['latitude'] !== null && typeof user['longitude'] !== null) {
            for (let i = 0; i < result_arr.length; i++) {
                const store = result_arr[i]['store']
                result_arr[i]['distance'] = distanceToStore(store['latitude'], store['longitude'], user['latitude'], user['longitude'])
            }
        }
    })

    const total_results = result_arr.length
    let lower_bound = 0
    let upper_bound = PRODUCT_INCREMENT
    if (query.hasOwnProperty("page")) {
        let page = query['page']
        lower_bound = (PRODUCT_INCREMENT * (page - 1))
        upper_bound = PRODUCT_INCREMENT * page
        if (page < 1) throw new Error("page out of bounds")
        result_arr = pageOfProducts(page, result_arr)
    } else {
        result_arr = pageOfProducts(1, result_arr)
    }
    return {
        result_arr: result_arr,
        total: total_results,
        lower_bound: lower_bound,
        upper_bound: upper_bound,
        page_size: result_arr.length,
    }
}

function sortProductArrayByColumn(array, field, user) {
    switch (field) {
        case "name" : {
            array.sort((a, b) => {
                return a.name.localeCompare(b['name'])
            })
            break
        }
        case "price": {
            array.sort((a, b) => {
                return a.price - b.price
            })
            break
        }
        case "store": {
            array.sort((a, b) => {
                return a['store']['name'].localeCompare(b['store']['name'])
            })
            break
        }
        case "upc_code" : {
            array.sort((a, b) => {
                return a['upc_code'] > b['upc_code']
            })
            break
        }
        case "location" : {
            array.sort((a, b) => {
                console.log("running")
                const a_store = a['store']
                const b_store = b['store']
                const miToKm = .621371
                a['distance'] = Number((distanceToStore(a_store.latitude, a_store.longitude, user.latitude, user.longitude) * miToKm).toFixed(2))
                b['distance'] = Number((distanceToStore(b_store.latitude, b_store.longitude, user.latitude, user.longitude) * miToKm).toFixed(2))
                return a['distance'] -
                    b['distance']
            })
        }
    }
    return array
}

function validListProduct(user_id, listIdx, productId) {
    return (typeof user_id == "string" && typeof listIdx == "number" && typeof productId == "string")
}

function validProduct(body) {
    return (typeof (body['name']) == "string" && typeof (body['productId']) == "number" && (typeof (body['upc_code']) == "string" || typeof (body['upc_code']) == "number") && typeof (body['price']) == "number"
        && typeof (body['image_url']) == "string" && typeof (body['weight']) == "string"
        && typeof (body['store']) == "object" && typeof (body['store']['name']) == "string" && typeof (body['store']['latitude']) == "number" && typeof (body['store']['longitude']) == "number")
}

exports.productSuggestByName = productSuggestByName
exports.findUpcProductsArray = findUpcProductsArray
exports.getAverageOfUpc = getAverageOfUpc
exports.searchProductById = searchProductById
exports.loadAllProducts = loadAllProducts
exports.pageOfProducts = pageOfProducts
exports.addProduct = addProduct
exports.queryProduct = queryProduct
exports.addProductToList = addProductToList
exports.removeProductFromList = removeProductFromList
exports.sortProductArrayByColumn = sortProductArrayByColumn
exports.updateProductPrice = updateProductPrice