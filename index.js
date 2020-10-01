// read the .env file for api keys etc
const dotenv = require('dotenv');
// lodash goodness
var _ = require('lodash');
dotenv.config();
const bodyParser = require('body-parser');
// Import express
let express = require('express');
// Initialize the app
let app = express();
// read and parse JSON data 
var fs = require('fs');
// package that deals with money and real time conversion rates.
var fx = require('money');
// second package for dealing with money and conversion rates. Works in sycn with fx
var oxr = require('open-exchange-rates');
// Setup server port
var port = process.env.PORT
// moment js for dates
const moment = require('moment');
// scheduler to run scripts at certain times of day. Used to sort the order of transactions.
var schedule = require('node-schedule');

// Set App ID (required):
oxr.set({
     app_id: process.env.APP_ID
});

// Get latest exchange rates from API; pass to callback function when loaded:
oxr.latest(function (error) {

     if (error) {
          // `error` will contain debug info if something went wrong:
          console.log('ERROR loading data from Open Exchange Rates API! Error was:')
          console.log(error.toString());

          // Fall back to hard-coded rates if there was an error (see readme)
          return false;
     }

     // To load rates into the money.js (fx) library for easier currency
     // conversion, simply apply the rates and base currency like so:
     fx.rates = oxr.rates;
     fx.base = oxr.base;

});

//bodyparser so we can send Json requests to the server
app.use(bodyParser.json());

// Send message for default URL
app.get('/', (req, res) => res.send('Hello World'));

// make sure that all the endpoints he mentioned until now can only be accessed if you add the passphrase "Money4MeNot4u" somewhere in the request.
const auth = (req, res, next) => {
     let { passWord } = req.body;
     const secretPassword = process.env.secretPassword;
     try {
          console.log(`Checking for the super secret password...`)
          // reject the request if the passWord is not present or if it is wrong.
          if (!passWord || passWord != secretPassword)
               return res.status(401).json({ msg: 'YOU SHALL NOT PASS!' })

          console.log(`auth check completed...`)
          next();
     }
     catch (err) {
          res.status(500).json({ error: err.message });
     }
};

// this middleware logs all requests to the server. 
const requestLogger = (req, res, next) => {
     // userEmail is used as the identifer, this is purely for testing reasons. In a real development environment this would be handled with a JWT token/cookie.
     let { userEmail } = req.body
     try {
          let current_datetime = new Date();
          // format the time of the request to be precise, down to the second.
          let formatted_date =
               current_datetime.getFullYear() +
               "-" +
               (current_datetime.getMonth() + 1) +
               "-" +
               current_datetime.getDate() +
               " " +
               current_datetime.getHours() +
               ":" +
               current_datetime.getMinutes() +
               ":" +
               current_datetime.getSeconds();
          // record the method of the request
          let method = req.method;
          // record the url of the request
          let url = req.url;
          // record the status of the request.
          let status = res.statusCode;
          // read the log json file and make it editable
          fs.readFile('./log.json', 'utf-8', function (err, data) {
               if (err) throw err
               // parse the log file into an array so we can push our new request info into it.
               var logInfo = JSON.parse(data)
               // push the request info into the array
               logInfo.push({
                    "date": formatted_date,
                    "email": userEmail,
                    "log info": {
                         "method": method,
                         "url": url,
                         "status": status,
                    },
               })
               // save the file and keep the format with (null, 2). If an error, throw it.
               fs.writeFile('./log.json', JSON.stringify(logInfo, null, 2), 'utf-8', function (err) {
                    if (err) throw err
                    console.log('Log Done')
               })
          })
          // proceed!
          next();
     } catch {
          if (!userEmail) {
               return res.status(400).json('No user email was supplied.')
          }
     }
};


// endpoint that will allow you to retrieve the first_name, last_name and email of each customer from the database.
app.post('/user/info', auth, requestLogger, async (req, res) => {
     let customers = JSON.parse(fs.readFileSync('deli_customers.json', 'utf8'));
     let userValues = []
     try {
          for (i = 0; i < customers.length; i++) {
               userValues[i] = ({
                    first_name: customers[i]["first_name"],
                    second_name: customers[i]["last_name"],
                    email: customers[i]["email"]
               });
          }
          res.status(200).json(userValues)
     }

     catch {
          return res.status(400).json({ msg: 'An error occured when trying to retrieve the first_name, last_name, and email of each customer.' });
     }
});

// last_transactions are not ordered for the customers.
// Please write a script that orders these.
function orderTransactions() {
     try {
          // use the fs package to parse the JSON item and make it readable/editable.
          let transactionData = JSON.parse(fs.readFileSync('deli_customers.json', 'utf8'));
          // iterate through the JSON item and sort each of the last transaction arrays  
          for (i = 0; i <= transactionData.length; i++) {
               transactionData[i].last_transactions.sort(function (a, b) {
                    return new Date(a.date) - new Date(b.date)
               })
               console.log(transactionData[i].last_transactions)
               // we save the file after each iteration. 
               fs.writeFileSync('deli_customers.json', JSON.stringify(transactionData, null, 2));
          }

     } catch {
          console.log('something went wrong when ordering the dates!')
     }
}

//Jimbo's also asking if you could make sure that this script runs every wednesday at 1am (if the app is running of course).
// Basic CRON. Runs at 01:00 every wednesday when the app is running
schedule.scheduleJob('0 1 * * 3', function () {
     orderTransactions()
});


// Please write an endpoint that will calculate the distance between a given place and a customer to help Jimbo determine if it's worth it to visit them.
// send a location (lat1, lon1) plus a user's email address to find the distance between the user and the location
app.post('/user/distance', auth, requestLogger, (req, res) => {
     let customers = JSON.parse(fs.readFileSync('deli_customers.json', 'utf8'));
     // the first latitude and longtitude are supplied from the front end, along with an email address which corresponds to the user we want to find
     const { lat1, lon1, email } = req.body;
     // find the specific user in the JSON file using Javascript. Would usually use Mongoose for this but as we are not working with a NoSQL database
     // it seemed to make more sense to just use pure JS to manipulate JSON.
     let specificCustomer = customers.filter(function (el) {
          return el.email === email;
     });
     // get the values on latitude/longtitude from the specific customer. Then feed these into the function below.
     let lat2 = specificCustomer[0].address.coordinates["latitude"];
     let lon2 = specificCustomer[0].address.coordinates["longitude"];


     try {
          //This function takes in latitude and longitude of two locations and returns the distance between them as the crow flies (in km)
          // This uses the Haversine formula https://www.movable-type.co.uk/scripts/latlong.html
          function calcCrow(lat1, lon1, lat2, lon2) {
               // radius of earth in kilometers
               var R = 6371; // km
               //convert the two latitudes and longtitudes to radians
               var dLat = toRad(lat2 - lat1); // distance Latitude converted to radians
               var dLon = toRad(lon2 - lon1); // distance Longtitude converted to radians
               var lat1 = toRad(lat1); // converts latitude 1 to radians
               var lat2 = toRad(lat2); // converts latitude 2 to radians. These two latitudes are used when calculating the area.

               // calculate the area
               var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
               // calculate the circumference
               var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
               // calculate the distance 
               var d = R * c;
               return d;
          }

          // Converts numeric degrees to radians. Used in the above function.
          function toRad(Value) {
               return Value * Math.PI / 180;
          }

          // return the customers distance in meters to the front end. just /1000 if we wanted to see km.
          return res.status(200).json("This troublesome customer is" + " " + calcCrow(lat1, lon1, lat2, lon2).toFixed(1) + " " + "meters away.");
     }

     catch {
          return res.status(400).json({ msg: `An error occured when trying to calculate the customer's distance.` });
     }
});

//Create an endpoint that can update the currencies and prices of suppliers with real time conversion rates.
app.post('/items/priceandcurrency', auth, requestLogger, (req, res) => {
     let { item, newCurrency } = req.body

     try {
          // use the fs package to parse the JSON item and make it readable/editable.
          let content = JSON.parse(fs.readFileSync('inventory.json', 'utf8'));

          // filter the JSON item to find the particular item we want to edit 
          let specificItem = content.filter(function (el) {
               return el.item === item;
          });

          // once the filtering has occured, we get the price of the item. This is referred to as the old price.
          let oldPrice = specificItem[0].details.price;
          // we also get the old currency code. This is used to calculate the new price.
          let oldCurrency = specificItem[0].supplier_details.currency;

          // using the fx package and it's up to date conversion rates to convert currency and price 
          let newPrice = fx(oldPrice).from(oldCurrency).to(newCurrency);

          // set the new price and new currency in the JSON file.
          specificItem[0].details.price = newPrice
          specificItem[0].supplier_details.currency = newCurrency


          //write file
          fs.writeFileSync('inventory.json', JSON.stringify(content, null, 2));

          // basic time stamp for sending conversion time back to user.
          let conversionTimeStamp = 'Exchange rates published: ' + (new Date(oxr.timestamp)).toUTCString();
          // send the result back to the user.
          res.status(200).json(`You have just changed the price of ${item} from ${oldPrice} ${oldCurrency} to ${newPrice} ${newCurrency}. This conversion was based on ${conversionTimeStamp}. Published by 'https://openexchangerates.org/' `);

     } catch {
          if (newCurrency.length > 3) {
               res.status(400).json(`Please use an abbreviated currency name instead. You can find a full list here: 'https://www.easymarkets.com/eu/learn-centre/discover-trading/currency-acronyms-and-abbreviations/' `)
          }
          else
               res.status(400).json(`looks like you made a bad request!`)
     }
});

//Lastly, create an endpoint that can add items to the inventory.
app.post('/items/add', auth, requestLogger, (req, res) => {
     // all of the values are sent in the request body. Sent unstructured, just as an object containing values, which is then destructured below.
     // if we were to send the data in a structured way similar to 'newItem' below we could just JSON stringify the req.body and save it directly. 
     // wasn't asked for the task, but if we were created a DB, we should have definitely have a catch which stops duplicate items being created
     let { item, price, amount, last_purchased, color, color_hex, country, country_code, currency, phone, email } = req.body

     try {
          // read the file. if there's an error then throw it.
          fs.readFile('./inventory.json', 'utf-8', function (err, data) {
               if (err) throw err
               // parse the file and turn it into an array so that we can then push our new object into it
               var arrayOfObjects = JSON.parse(data)
               arrayOfObjects.push({
                    "item": item,
                    "details": {
                         "price": price,
                         "amount": amount,
                         "last_purchased": last_purchased,
                         "color": color,
                         "color_hex": color_hex
                    },
                    "supplier_details": {
                         "country": country,
                         "country_code": country_code,
                         "currency": currency,
                         "contact": {
                              "phone": phone,
                              "email": email
                         }
                    }
               })

               console.log(arrayOfObjects)
               // save the file and keep the format with (null, 1). If an error, throw it.
               fs.writeFile('./inventory.json', JSON.stringify(arrayOfObjects, null, 2), 'utf-8', function (err) {
                    if (err) throw err
                    console.log('Done!')
               })
          })

          // let the user know that the inventory has been successfully updated.
          res.status(200).json('inventory updated!')
     }

     catch {
          return res.status(400).json({ msg: `An error occured when adding items.` });
     }
});


// Create an endpoint that can process customer orders (make the relevant database updates).
app.post('/orders/process',auth, requestLogger, (req, res) => {
     let { order, id} = req.body
     try {
          // this array stores the cost of the items. It's then reduced to give the overall value of the purchase.
          // this is a big flaw in the database as the cost of the transaction is not currency specific.
          // for a real product we would need to convert all costs into a singular currency such as USD.
          let costStorage = []

          // #################everything relating to updating the inventory for the order########
          // use the fs package to parse the JSON item and make it readable/editable.
          let inventoryContent = JSON.parse(fs.readFileSync('inventory.json', 'utf8'));

          for (i = 0; i < order.length; i++) {
               // the item itself
               let item = order[i].item
               // how many of the item are currently in stock
               let quantity = order[i].quantity
               // filter the JSON item to find the particular item we want to edit 
               let specificItem = inventoryContent.filter(function (el) {
                    return el.item === item;
                });
               // the current price of the item we are updating
               let itemPrice = specificItem[0].details.price;
               // the current quantity of the item we are updating
               let itemQuantity = specificItem[0].details.amount;
               // the new quantity of the item we are updating
               let newQuantity = itemQuantity - quantity;
               // the total cost of the order
               let cost = quantity * itemPrice.toString();
               costStorage.push(cost)

               specificItem[0].details.amount = newQuantity

                fs.writeFileSync('inventory.json', JSON.stringify(inventoryContent, null, 2)); 
          }

           //##############################everything relating to updating the customer for the order ########################
           // read the deli customers file and make it editable
           let customerContent = JSON.parse(fs.readFileSync('deli_customers.json', 'utf8'));
           // filters all customers to find the specific customer.
           let specificCustomer = customerContent.filter(function (el) {
              return el.id === id;
           });
           // date timestamp for the time of the order/transaction
           let date = new Date();
           var dateString = moment(date).format('YYYY-MM-DD');
           
           // reduce the cost array to find the final price of the transaction
           let costString = costStorage.reduce(function(a, b){
               return a + b;
           }, 0);

           // push the new transaction into the existing customer's last_transactions array. Future design could be to push them in in order? Would then remove need for script that orders transactions.
          specificCustomer[0].last_transactions.push({
               "date": dateString,
              "amount": costString.toString()
          });

          // save the file with the new transaction(s) added.
           fs.writeFileSync('deli_customers.json', JSON.stringify(customerContent, null, 2)); 

           // update the suer with what has happened
           return res.status(200).json(`Your order was processed on ${dateString}, for a cost of ${costString}`)

   }   catch {
          return res.status(400).json({ msg: `An error occured when processing the customers order` });
     }
});



// run a few tests to prove that your app works, he will then check the databases to see if stuff changed acordingly.
// 1) Customer with id = 4 (probably a Colombian chef) has gone and made a purchase of 12 dolphins and 4 truffles -> COMPLETE
// 2) Customer with id = 1 (probably Dan Bilzerian’s long-lost cousin) has bought 1 helicopter, 5 AK47s, 3 cocaines -> COMPLETE
// 3) For this year, we are adding a new item to our menu, it’s hand_sanitizer. It’ll be supplied by the same exact supplier
// as toilet_paper. We’ll order 500, with a 10.00 price tag. Color will be green, hex: #302. -> COMPLETE



// Launch app to listen to specified port
app.listen(port, function () {
     console.log("Running API test bed on port " + port);
});