const {PRODUCTS_DB, PRODUCTS_COLLECTION} = require('./globals')
const {ObjectId} = require("mongodb");
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
    if (typeof (body['name']) == "string" && typeof (body['productId']) == "number" && typeof (body['upc_code']) == "number" && typeof (body['price']) == "number" && typeof (body['store']) == "object" && typeof (body['store']['name']) == "string" && typeof (body['store']['latitude']) == "number" && typeof (body['store']['longitude']) == "number") {
        client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION).insertOne(body)
    } else {
        throw new Error("Invalid product type")
    }
}

async function searchProductByName(client, productId) {
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

exports.productSuggestByName = productSuggestByName
exports.searchProductByName = searchProductByName
exports.loadAllProducts = loadAllProducts
exports.pageOfProducts = pageOfProducts
exports.addProduct = addProduct
exports.queryProduct = queryProduct