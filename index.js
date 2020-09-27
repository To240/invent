let customers = require('./deli_customers.json')
let inventory = require('./inventory.json')
const bodyParser = require('body-parser');
// Import express
let express = require('express')
// Initialize the app
let app = express();
// read and parse JSON data 
const fs = require('fs')
// package that deals with money and real time conversion rates.
var fx = require('money');
// second package for dealing with money and conversion rates. Works in sycn with fx
var oxr = require('open-exchange-rates');
// Setup server port
var port = process.env.PORT || 8081;
//access to user cookies
var cookieParser = require('cookie-parser');
//axios to make a request to openexchange money rates
let axios = require('axios')

// Set App ID (required):
oxr.set({
	app_id: 'a701d79fd8e54f6095ee259883ce36ec'
});

// Get latest exchange rates from API; pass to callback function when loaded:
oxr.latest(function(error) {

	if ( error ) {
		// `error` will contain debug info if something went wrong:
		console.log( 'ERROR loading data from Open Exchange Rates API! Error was:' )
		console.log( error.toString() );

		// Fall back to hard-coded rates if there was an error (see readme)
		return false;
	}

	// Rates are now stored in `oxr` object as `oxr.rates` - enjoy!
	// Examples to follow:

	// The timestamp (published time) of the rates is in `oxr.timestamp`:
	console.log( 'Exchange rates published: ' + (new Date(oxr.timestamp)).toUTCString() );

	// Each currency is a property in the object/hash, e.g:
	console.log( 'Dollar -> HKD: ' + oxr.rates.HKD );
	console.log( 'USD -> HKD: ' + oxr.rates['HKD'] );

	// To load rates into the money.js (fx) library for easier currency
	// conversion, simply apply the rates and base currency like so:
	fx.rates = oxr.rates;
	fx.base = oxr.base;

	// money.js is now initialised with the exchange rates, so this will work:
	var amount = fx(10).from('EUR').to('GBP').toFixed(6);
	console.log( '10 EUR in GBP: ' + amount );

});
app.use(cookieParser());

//bodyparser so we can send Json requests to the server
app.use(bodyParser.json());

// Send message for default URL
app.get('/', (req, res) => res.send('Hello World'));

// endpoint that will allow you to retrieve the first_name, last_name and email of each customer from the database.
//async as needs to complete a loop before sending res
app.get('/user/info', async(req,res) => {
     let userValues = []
     try{
         for (i = 0; i< customers.length; i++){
              userValues[i] = ({first_name:customers[i]["first_name"],
                              second_name: customers[i]["last_name"],
                              email: customers[i]["email"]});
         }
     res.send(moneyRates)
     }

     catch{
          return res.status(400).json({ msg: 'An error occured when trying to retrieve the first_name, last_name, and email of each customer.' });
     }
})

// last_transactions are not ordered for the customers.
// Please write a script that orders these. Jimbo's also asking if you could make sure that this script runs every wednesday at 1am (if the app is running of course).
app.get('/user/transactions/order', async(req,res) => {
     // empty arrange to house the transaction data
     let userValues = []
     // generic try/catch for catching errors
     try{
          // loop that runs based on customers.length
         for (i = 0; i< customers.length; i++){
              // adds values to the userValues array. Then sorts them by date.
              userValues[i] = (customers[i]["last_transactions"].sort(function(a, b){
                   // creates new dates and then subtracts them from one another. Smallest remainder entered first. 
                   return new Date(a.date) - new Date(b.date)
              }));
         }
          // returns the userValues array to the user after the loop has finished putting the ordered values in.
     res.send(userValues)
     }

     catch{
          return res.status(400).json({ msg: 'An error occured when trying to retrieve the first_name, last_name, and email of each customer.' });
     }
})

// Please write an endpoint that will calculate the distance between a given place and a customer to help Jimbo determine if it's worth it to visit them.
// send a location (lat1, lon1) plus a user's email address to find the distance between the user and the location
app.post('/user/distance', (req,res) => {
     // the first latitude and longtitude are supplied from the front end, along with an email address which corresponds to the user we want to find
     const {lat1, lon1, email} = req.body;
     // find the specific user in the JSON file using Javascript. Would usually use Mongoose for this but as we are not working with a NoSQL database
     // it seemed to make more sense to just use pure JS to manipulate JSON.
     let specificCustomer = customers.filter(function (el) {
          return el.email === email;
        });
        // get the values on latitude/longtitude from the specific customer. Then feed these into the function below.
     let lat2 = specificCustomer[0].address.coordinates["latitude"];
     let lon2 = specificCustomer[0].address.coordinates["longitude"];


     try{
           //This function takes in latitude and longitude of two locations and returns the distance between them as the crow flies (in km)
           // for driving distance we could use the Google maps API instead.
    function calcCrow(lat1, lon1, lat2, lon2) 
    {
     // radius of earth in kilometers
      var R = 6371; // km
      //convert the two latitudes and longtitudes to radians
      var dLat = toRad(lat2-lat1); // distance Latitude converted to radians
      var dLon = toRad(lon2-lon1); // distance Longtitude converted to radians
      var lat1 = toRad(lat1); // converts latitude 1 to radians
      var lat2 = toRad(lat2); // converts latitude 2 to radians. These two latitudes are used when calculating the area.

      // calculate the area
      var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2); 
        // calculate the circumference
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
      // calculate the distance 
      var d = R * c;
      return d;
    }

    // Converts numeric degrees to radians. Used in the above function.
    function toRad(Value) 
    {
        return Value * Math.PI / 180;
    } 

    // return the customers distance in meters to the front end.
    return res.status(200).json("This troublesome customer is" + " " + calcCrow(lat1,lon1,lat2,lon2).toFixed(1) + " " + "meters away.");
     }

     catch{
          return res.status(400).json({ msg: `An error occured when trying to calculate the customer's distance.` }); 
     }
})

//Create an endpoint that can update the currencies and prices of suppliers with real time conversion rates.
app.post('/items/priceandcurrency', (req,res) => {
     let {item, currency} = req.body
     try{
               // we need to get the current price and currency. 
               let specificItem = inventory.filter(function (el) {
                    return el.item === item;
                  });
               let oldPrice = specificItem[0].details.price;
               let oldCurrency = specificItem[0].supplier_details.currency
               let conversionTimeStamp = 'Exchange rates published: ' + (new Date(oxr.timestamp)).toUTCString();
               
               let newPrice = fx(10).from(`USD`).to('GBP').toFixed(6);
               res.status(200).json( '10 EUR in GBP: ' + newPrice );
           
              
  
                  
               // then we need to change the currency string from X to Y 

               //then we need to return the updated items to the front end. Along with exchange rate?
             //  return res.status(200).json(`The price of ${item} has been updated from ${oldPrice}${oldCurrency} to ${newPrice}${newCurrency}. ${conversionTimeStamp}`)
     
               }catch{
          return res.status(400).json({ msg: `An error occured when updating currencies.` }); 
     }
})

//Lastly, create an endpoint that can add items to the inventory.

app.get('/items/add', (req,res) => {
     try{

     }

     catch{
          return res.status(400).json({ msg: `An error occured when adding items.` });  
     }
})

// make sure that all the endpoints he mentioned until now can only be accessed if you add the passphrase "Money4MeNot4u" somewhere in the request.
const auth = (req, res, next) => {
     let { token } = req.body;
     try {
         console.log(token)
         console.log(`auth check running...`)
         if (!token)
             return res.status(401).json({ msg: 'no authentication token, authorisation denied' })
 
         const verified = jwt.verify(token, process.env.JWT_KEY);
         if (!verified)
             return res.status(401).json({ msg: 'no authentication token, authorisation denied' })
 
         req.user = verified.id;
         console.log(`auth check completed...`)
         next();
     }
     catch (err) {
         res.status(500).json({ error: err.message });
     }
 };

// Create an endpoint that can process customer orders (make the relevant database updates).

app.get('/orders/process', (req,res) => {
     try{

     }

     catch{
          return res.status(400).json({ msg: `An error occured when processing the customers order` }); 
     }
})

// only his registered customers can use the app. Everytime they do, he wants to store these "events" inside a new database that also shows who made
// the request and when it was made. He doesn't care about how it's done, as long as it's done.

app.get('/customer/events', (req,res) => {
     try{

     }

     catch{
          return res.status(400).json({ msg: `An error occured when updating the request record.` }); 
     }
})

// run a few tests to prove that your app works, he will then check the databases to see if stuff changed acordingly.
// 1) Customer with id = 4 (probably a Colombian chef) has gone and made a purchase of 12 dolphins and 4 truffles
// 2) Customer with id = 1 (probably Dan Bilzerian’s long-lost cousin) has bought 1 helicopter, 5 AK47s, 3 cocaines
// 3) For this year, we are adding a new item to our menu, it’s hand_sanitizer. It’ll be supplied by the same exact supplier
// as toilet_paper. We’ll order 500, with a 10.00 price tag. Color will be green, hex: #302.



// Launch app to listen to specified port
app.listen(port, function () {
     console.log("Running API test bed on port " + port);
});