require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// CORS Options
const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    optionSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Verify JWT Token Middleware
const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log(err);
            return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.user = decoded;
        next();
    });
};


// MongoDB Connection String
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lbrnp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create MongoClient
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});


const userCollection = client.db('QuickCart').collection('users');
const ProductCollection = client.db('QuickCart').collection('products');
const OrderCollection = client.db('QuickCart').collection('orders');
const sellerCollection = client.db('QuickCart').collection('sellers');




    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
        const email = req.user?.email;
        const query = { email }
        const result = await userCollection.findOne(query)
        if (!result || result?.role !== 'admin')
          return res
            .status(403)
            .send({ message: 'Forbidden Access ! Admin only Action' })
        next()
  
      }
      const verifySeller = async (req, res, next) => {
        const email = req.user?.email;
        const query = { email }
        const result = await userCollection.findOne(query)
        if (!result || result?.role !== 'seller')
          return res
            .status(403)
            .send({ message: 'Forbidden Access ! Seller only Action' })
        next()
  
      }
  













// Generate JWT Token Route
app.post('/jwt', async (req, res) => {
    const { email } = req.body; // Ensure email is passed in the request body
    if (!email) {
        return res.status(400).send({ message: 'Email is required' });
    }
    const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
    });
    res
        .cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
});

// Logout Route
app.get('/logout', async (req, res) => {
    try {
        res
            .clearCookie('token', {
                maxAge: 0,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            })
            .send({ success: true });
    } catch (err) {
        res.status(500).send(err);
    }
});



// User<------------------------------------------>
// save or update user in db


app.post('/users/:email', async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const user = req.body;

    const isExist = await userCollection.findOne(query);
    if (isExist) {
        return res.send(isExist);
    }
    const result = await userCollection.insertOne({
        ...user,
        role: 'customer',
        timestamp: Date.now(),
    });
    res.send(result);
})
// // manage user status and role
app.patch('/users/:email', verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { email }
    const user = await userCollection.findOne(query)
    if (!user || user?.status === 'Requested')
        return res
            .status(400)
            .send('You Have already requested,wait for some time')


    const updateDoc = {
        $set: {
            status: 'Requested'
        }
    }
    const result = await userCollection.updateOne(query, updateDoc)
    res.send(result)

})
//   get user role
app.get('/users/role/:email', async (req, res) => {
    const email = req.params.email
    const result = await userCollection.findOne({ email })
    res.send({ role: result?.role })
  })
// get all user data
app.get('/all-users/:email', verifyToken,verifyAdmin,  async (req, res) => {
    const email = req.params.email
    const query = { email: { $ne: email } }
    const result = await userCollection.find(query).toArray()
    res.send(result)
  })

//   update user role :status
app.patch('/users/role/:email',verifyToken,verifyAdmin,async(req,res)=>{
    const email = req.params.email;
    const{ role}=req.body;
    const filter={email}
    const updateDoc = {
        $set: { role, status: 'Verified' },
      };

      const result=await userCollection.updateOne(filter,updateDoc)
      res.send(result)


})










// seller-----------------------------------------
app.post('/sellers/:email',verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { email };
    const user = req.body;

    // চেক করুন যে এই ইমেইলটি ইতিমধ্যে বিক্রেতা হয়ে গেছে কিনা
    const existingSeller = await sellerCollection.findOne({ email });

    if (existingSeller) {
        // যদি বিক্রেতা হয়, তাহলে আবার নিবন্ধন করা যাবে না
        return res.status(400).send({ message: "User is already a seller" });
    }

    // নতুন বিক্রেতা তৈরি করুন
    const result = await sellerCollection.insertOne({
        ...user,
        role: 'customer',
        timestamp: Date.now(),
    });

    res.send(result);
});
// get all seller data in db
app.get('/sellers', verifyToken,verifyAdmin, async (req, res) => {
    const result = await sellerCollection.find().toArray()
    res.send(result)
})
// get a seller by id
app.get('/seller/:id',verifyToken,verifyAdmin,  async (req, res) => {
    const id = req.params.id
    const query = { _id: new ObjectId(id) }
    const result = await sellerCollection.findOne(query)
    res.send(result)
})
// delete seller request
app.delete('/seller/:id', verifyToken, async (req, res) => {
    const id = req.params.id
    const query = { _id: new ObjectId(id) }
    const result = await sellerCollection.deleteOne(query)
    res.send(result)
})





// Product<------------------------------------------------>


//  get inventory data for  seller
app.get('/products/seller', verifyToken, verifySeller, async (req, res) => {
    const email = req.user.email
    const result = await ProductCollection.find({ 'seller.email': email }).toArray()
    res.send(result)
  })

  // delete a Panjabi from db by seller
  app.delete('/products/:id', verifyToken, verifySeller, async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) }
    const result = await ProductCollection.deleteOne(query)
    res.send(result)
  })








app.post('/products', verifyToken, async (req, res) => {
    const product = req.body;
    const result = await ProductCollection.insertOne(product)
    res.send(result)
})
// get all product data in db
app.get('/products', async (req, res) => {
    const result = await ProductCollection.find().toArray()
    res.send(result)
})
// get a product by id
app.get('/product/:id', async (req, res) => {
    const id = req.params.id
    const query = { _id: new ObjectId(id) }
    const result = await ProductCollection.findOne(query)
    res.send(result)
})





//   order<------------------------------------------------>
//   save order data in db
app.post('/orders', verifyToken, async (req, res) => {
    const orderInfo = req.body;
    const result = await OrderCollection.insertOne(orderInfo)
    res.send(result)
})
// manage product quantity
app.patch('/products/quantity/:id', verifyToken, async (req, res) => {
    const id = req.params.id;
    const { quantityToUpdate, status } = req.body;
    const filter = { _id: new ObjectId(id) };

    // Default update for decreasing quantity
    let updateDoc = {
        $inc: { quantity: -quantityToUpdate }
    };

    // If status is 'increase', modify the updateDoc to increase the quantity
    if (status === 'increase') {
        updateDoc = {
            $inc: { quantity: quantityToUpdate }
        };
    }

    try {
        // Perform the update
        const result = await ProductCollection.updateOne(filter, updateDoc);
        res.send(result);
    } catch (error) {
        res.status(500).send({ error: 'Failed to update quantity' });
    }
});
// // get all   order  for a specific customer
app.get('/customer-orders/:email', verifyToken, async (req, res) => {
    const email = req.params.email
    const query = { 'customer.email': email }
    const result = await OrderCollection.aggregate([
        {
            $match: query
        },
        {
            $addFields: {

                productId: { $toObjectId: '$productId' }
            }
        },
        {
            $lookup: {
                from: 'products',
                localField: 'productId',
                foreignField: '_id',
                as: 'products'
            }
        },
        { $unwind: '$products' },
        {
            $addFields: {
                name: '$products.productName',
                image: '$products.image'
            }
        },
        {
            $project: {
                products: 0,
            }
        }

    ]).toArray()

    res.send(result)
})
// cancel order
app.delete('/orders/:id', verifyToken, async (req, res) => {
    const id = req.params.id
    const query = { _id: new ObjectId(id) }
    const orders = await OrderCollection.findOne(query)
    if (orders.status === 'Delivered') {
        res.status(409).send('Cannot cancel once the product is delivered')
    }
    const result = await OrderCollection.deleteOne(query)
    res.send(result)
})






















// Root Route
app.get('/', (req, res) => {
    res.send('QuickCart is Running');
});

// MongoDB Connection Check
async function run() {
    try {
        await client.connect();
        console.log('Connected to MongoDB!');
        // Send a ping to confirm a successful connection
        // await client.db('admin').command({ ping: 1 });
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
    }
}

// Ensure MongoDB connection is active
run().catch(console.dir);

// Start the server
app.listen(port, () => {
    console.log(`QuickCart is Running on port ${port}`);
});
