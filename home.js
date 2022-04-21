const {USER_DB, USER_COLLECTION} = require("./globals");
const {findUser} = require("./lists");

async function updateLocation(client, lat, lon, userId) {
    const collection = client.db(USER_DB).collection(USER_COLLECTION)
    return collection.updateOne({uid: userId}, {$set: {latitude: lat, longitude: lon}})
}

async function getLastLocation(client, userId) {
    return await findUser(client, userId).then((user) => {
        if (user != null && user['latitude'] != null && user['longitude'] != null) {
            return {latitude: user['latitude'], longitude: user['longitude']}
        }
    })
}

function typeValidator(types) {
    try {
        let valid = true
        for (const [key, val] of Object.entries(types)) {
            val.forEach(value => {
                if (typeof (value) !== key) valid = false
            })
        }
        return valid
    } catch (e) {
        return false
    }
}

// function in km
// 1 mi -> 1.60934 km
function distanceToStore(lat1, lon1, lat2, lon2) {
    const p = 0.017453292519943295;    // Math.PI / 180
    const c = Math.cos;
    const a = 0.5 - c((lat2 - lat1) * p) / 2 +
        c(lat1 * p) * c(lat2 * p) *
        (1 - c((lon2 - lon1) * p)) / 2;

    return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
}

exports.typeValidator = typeValidator
exports.updateLocation = updateLocation
exports.getLastLocation = getLastLocation
exports.distanceToStore = distanceToStore