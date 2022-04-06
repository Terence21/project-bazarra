const {PRODUCTS_DB, PRODUCTS_COLLECTION, ADD_LIST, ADD_PRODUCT_LIST, REMOVE_PRODUCT_LIST} = require('./globals')
const {ObjectId} = require("mongodb");
const {listManagement, getPreviousListPrice} = require("./lists");
const PRODUCT_INCREMENT = 200
const PRODUCT_MAX = 1000
const INCREMENT_MAX = (PRODUCT_MAX / PRODUCT_INCREMENT) - 1

async function loadAllProducts(client) {
    const collection = client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION)
    let cursor = await collection.find().limit(PRODUCT_MAX)
    let results = cursor.toArray()
    console.log(results)
    return results
}

function pageOfProducts(page, arr) {
    if (page < 1 || page > INCREMENT_MAX) return -1
    return arr.slice((PRODUCT_INCREMENT * (page - 1)), (PRODUCT_INCREMENT * page) - 1)
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
    if (query.hasOwnProperty("name")) builder.name = {$regex: query.name}
    if (query.hasOwnProperty("price")) builder.price = parseFloat(query.price)
    if (query.hasOwnProperty("store")) builder["store.name"] = {$regex: query.store}
    if (query.hasOwnProperty("upc_code")) builder.upc_code = parseInt(query.upc_code)
    return await client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION).find(builder).toArray()
}

function validListProduct(user_id, listIdx, productId) {
    return (typeof user_id == "string" && typeof listIdx == "number" && typeof productId == "string")
}

function validProduct(body) {
    return (typeof (body['name']) == "string" && typeof (body['productId']) == "number" && typeof (body['upc_code']) == "number" && typeof (body['price']) == "number"
        && typeof (body['image_url']) == "string" && typeof (body['weight']) == "string"
        && typeof (body['store']) == "object" && typeof (body['store']['name']) == "string" && typeof (body['store']['latitude']) == "number" && typeof (body['store']['longitude']) == "number")
}

exports.productSuggestByName = productSuggestByName
exports.searchProductById = searchProductById
exports.loadAllProducts = loadAllProducts
exports.pageOfProducts = pageOfProducts
exports.addProduct = addProduct
exports.queryProduct = queryProduct
exports.addProductToList = addProductToList
exports.removeProductFromList = removeProductFromList