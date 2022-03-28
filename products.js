const {PRODUCTS_DB, PRODUCTS_COLLECTION} = require('./globals')
const {ObjectId} = require("mongodb");
const PRODUCT_INCREMENT = 5
const PRODUCT_MAX = 20
const INCREMENT_MAX = (PRODUCT_MAX / PRODUCT_INCREMENT) - 1

async function loadAllProducts(client) {
    const collection = client.db(PRODUCTS_DB).collection(PRODUCTS_COLLECTION)
    let cursor = await collection.find().limit(PRODUCT_MAX)
    let results = cursor.toArray()
    console.log(results)
    return results
}

function pageOfProducts(page, arr) {
    if (page < 1 || page > INCREMENT_MAX) return new Error("Invalid page request")
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
                        "maxEdits": 2, // check usage
                        "prefixLength": 1 // check usage
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

exports.productSuggestByName = productSuggestByName
exports.searchProductByName = searchProductByName
exports.loadAllProducts = loadAllProducts
exports.pageOfProducts = pageOfProducts
exports.addProduct = addProduct

/**
 *name
 *productId
 *upc_code
 *price
 *store : {
 *     name
 *     lat
 *     long
 *}
 *
 */