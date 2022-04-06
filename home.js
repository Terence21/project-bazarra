const express = require('express')
const {USER_DB, USER_COLLECTION} = require("./globals");
const router = express.Router()

router.post('/user/location', (req, res) => {
    const body = req.body
    const lat = body['latitude']
    const lon = body['longitude']
    const userId = body['uid']
    if (typeValidator({"number": [lat, lon] , "string": [userId]})){
        try {
            updateLocation(client, lat, lon, userId)
        }catch (e) {
            res.send({status: 404, message: e.message})
        }
    }else {
        res.send({status: 400, message: "invalid request body"})
    }
})

async function updateLocation(client, lat, lon, userId){
    const collection = client.db(USER_DB).collection(USER_COLLECTION)
    collection.updateOne({uid: userId}, {$set: {latitude: lat, longitude: lon}})
}

function typeValidator(types){
    try{
       for (const [key, val] of Object.entries(types)){
           val.forEach(value => {
               if (typeof(value) !== key) return false
           })
       }
        return true
    }catch (e){
        return false
    }
}

exports.typeValidator = typeValidator
exports.updateLocation = updateLocation