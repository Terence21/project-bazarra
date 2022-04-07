const {USER_DB, USER_COLLECTION} = require("./globals");

async function updateLocation(client, lat, lon, userId) {
    const collection = client.db(USER_DB).collection(USER_COLLECTION)
    return collection.updateOne({uid: userId}, {$set: {latitude: lat, longitude: lon}})
}

function typeValidator(types) {
    try {
        for (const [key, val] of Object.entries(types)) {
            val.forEach(value => {
                if (typeof (value) !== key) return false
            })
        }
        return true
    } catch (e) {
        return false
    }
}

exports.typeValidator = typeValidator
exports.updateLocation = updateLocation