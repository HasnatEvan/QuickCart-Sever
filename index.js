require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId, OrderedBulkOperation } = require('mongodb');
const nodemailer = require("nodemailer");
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
//send email using nodemailer
const sendEmail = (emailAddress, emailData) => {
    // create transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // true for port 465, false for other ports
      auth: {
        user: process.env.NODEMAILER_USER,
        pass: process.env.NODEMAILER_PASS,
      },
    });
    // verify connection
    transporter.verify((error, success) => {
      if (error) {
        console.log(error)
      } else {
        console.log('Transporter is ready to emails', success)
      }
    })
    //  transporter.sendMail()
    const mailBody = {
      from: process.env.NODEMAILER_USER, // sender address
      to: emailAddress, // list of receivers
      subject: emailData?.subject,
      // text: emailData?.message, // plain text body
      html: `<p>${emailData?.message}</p>`, // html body
    }
    // send email
    transporter.sendMail(mailBody, (error, info) => {
      if (error) {
        console.log(error)
      } else {
        // console.log(info)
        console('Email Sent: ' + info?.response)
      }
  
    })
  }


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
const reviewCollection = client.db('QuickCart').collection('reviews');




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
app.get('/all-users/:email', verifyToken, verifyAdmin, async (req, res) => {
    const email = req.params.email
    const query = { email: { $ne: email } }
    const result = await userCollection.find(query).toArray()
    res.send(result)
})

//   update user role :status
app.patch('/users/role/:email', verifyToken, verifyAdmin, async (req, res) => {
    const email = req.params.email;
    const { role } = req.body;
    const filter = { email }
    const updateDoc = {
        $set: { role, status: 'Verified' },
    };

    const result = await userCollection.updateOne(filter, updateDoc)
    res.send(result)


})










// seller-----------------------------------------
app.post('/sellers/:email', verifyToken, async (req, res) => {
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
app.get('/sellers', verifyToken, verifyAdmin, async (req, res) => {
    const result = await sellerCollection.find().toArray()
    res.send(result)
})
// get a seller by id
app.get('/seller/:id', verifyToken, verifyAdmin, async (req, res) => {
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

/// Update product
app.put("/products/:id", verifyToken, verifySeller, async (req, res) => {
    const id = req.params.id;
    const updatedProduct = req.body;
  
    const filter = { _id: new ObjectId(id) };
  
    // Create the updated document with the fields you want to update
    const updatedDoc = {
      $set: {
        productName: updatedProduct.productName,
        image: updatedProduct.image,
        shopName: updatedProduct.shopName,
        description: updatedProduct.description,
        quantity: updatedProduct.quantity,
        price: updatedProduct.price,
        discountedPrice: updatedProduct.discountedPrice,
        category: updatedProduct.category,
        bkashNumber: updatedProduct.bkashNumber,
        nogodNumber: updatedProduct.nogodNumber,
        shopPunnumber: updatedProduct.shopPunnumber,
        sizes: updatedProduct.sizes,
        seller: updatedProduct.seller,
        deliveryPrice: updatedProduct.deliveryPrice,
        discountPercentage: updatedProduct.discountPercentage,
      },
    };
  
    try {
      // Update the product in the database
      const result = await ProductCollection.updateOne(filter, updatedDoc);
  
      if (result.modifiedCount > 0) {
        res.status(200).json({ message: "Product updated successfully!" });
      } else {
        res.status(400).json({ message: "No changes made to the product." });
      }
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "An error occurred while updating the product." });
    }
  });
  







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

    // 🔥 `orderDate` ফিল্ড যোগ করা
    orderInfo.orderDate = new Date(); 

    const result = await OrderCollection.insertOne(orderInfo);

    if (result?.insertedId) {
        // কাস্টমারকে ইমেইল পাঠানো
        await sendEmail(orderInfo.customer?.email, {
            subject: "🎉 Order Successful!",
            message: `
                <h3>Dear ${orderInfo.customer?.email},</h3>
                <p>Thank you for placing an order with us. Your order is now being processed.</p>
                <p><strong>Order ID:</strong> ${result.insertedId}</p>
                <p><strong>Order Date:</strong> ${orderInfo.orderDate.toISOString()}</p>
                <p>We'll notify you once your order is shipped.</p>
                <br>
                <p>Best Regards,<br>QuickCart-BD</p>
            `
        });

        // বিক্রেতাকে ইমেইল পাঠানো
        await sendEmail(orderInfo?.seller, {
            subject: "📦 New Order Received!",
            message: `
                <h3>Hello Seller,</h3>
                <p>You have received a new order from <strong>${orderInfo?.customer?.email}</strong>.</p>
                <p><strong>Order Date:</strong> ${orderInfo.orderDate.toISOString()}</p>
                <p>Please start processing the order as soon as possible.</p>
                <br>
                <p>Thanks,<br>QuickCart-BD</p>
            `
        });
    }

    res.send(result);
});

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
// // get all   order  for a specific seller
app.get('/seller-orders/:email', verifyToken, async (req, res) => {
    const email = req.params.email
    const query = { seller: email }
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

// update a order status
app.patch('/update-order-status/:id', verifyToken, verifySeller, async (req, res) => {
    const id = req.params.id;
    const { status } = req.body;

    // অর্ডার খুঁজে বের করা
    const orderInfo = await OrderCollection.findOne({ _id: new ObjectId(id) });

    if (!orderInfo) {
        return res.status(404).send({ message: 'Order not found' });
    }

    // যদি নতুন status পুরনো status-এর মতো হয়, তাহলে কিছুই হবে না
    if (orderInfo.status === status) {
        return res.status(400).send({ message: 'Order status is already updated' });
    }

    const result = await OrderCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
    );

    if (result.modifiedCount > 0) {
        await sendEmail(orderInfo.customer?.email, {
            subject: "📦 Order Status Updated!",
            message: `
                <h3>Dear Customer,</h3>
                <p>Your order status has been updated to: <strong>${status}</strong>.</p>
                <p><strong>Order ID:</strong> ${orderInfo._id}</p>
                <p>Thank you for shopping with us!</p>
                <br>
                <p>Best Regards,<br>QuickCart-BD</p>
            `
        });
    }

    res.send(result);
});

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





// Review<------------------------------->
app.post('/reviews', async (req, res) => {
    const review = req.body;
    // বর্তমান তারিখ রিভিউ অবজেক্টে যুক্ত করা হচ্ছে
    review.date = new Date();
    
    const result = await reviewCollection.insertOne(review);
    res.send(result);
  });
  
app.get('/reviews', async (req, res) => {
    const result = await reviewCollection.find().sort({ _id: -1 }).limit(6).toArray();
    res.send(result);
});


// get a review by id
app.get('/reviews/product/:productId', async (req, res) => {
    const productId = req.params.productId;
    const query = { productId: productId };
    const reviews = await reviewCollection.find(query).toArray();
    res.send(reviews);
});

// Update a review by ID
app.put('/reviews/:id', async (req, res) => {
    const id = req.params.id;
    const updatedReview = req.body.review;

    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
            review: updatedReview
        }
    };

    const result = await reviewCollection.updateOne(filter, updateDoc);
    res.send(result);
});

// Delete a review by ID
app.delete('/reviews/:id', async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };

    const result = await reviewCollection.deleteOne(filter);
    res.send(result);
});





// admin Statistics
app.get('/admin-stat', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const totalUsers = await userCollection.countDocuments();
        const totalProducts = await ProductCollection.estimatedDocumentCount();

        // ✅ আজকের তারিখ UTC-তে সেট করা
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0); // 🔥 UTC অনুযায়ী ১২:০০ AM

        const tomorrow = new Date(today);
        tomorrow.setUTCDate(today.getUTCDate() + 1); // 🔥 পরবর্তী দিন

        // ✅ রাত ১২টা পর্যন্ত Order ফিল্টার করা (seller + orderDate সহ)
        const todayOrders = await OrderCollection.find({
            orderDate: { 
                $gte: today,  
                $lt: tomorrow
            }
        }).project({ _id: 1, price: 1, seller: 1, orderDate: 1 }).toArray(); // 🔥 orderDate সহ দেখাবে

        // ✅ আজকের মোট দাম হিসাব করা
        const totalPrice = todayOrders.reduce((acc, order) => acc + order.price, 0);

        res.send({ totalUsers, totalProducts, todayOrders, totalPrice });

    } catch (error) {
        console.error("Error fetching admin statistics:", error);
        res.status(500).send({ error: "Internal Server Error" });
    }
});

// seller-statistics
// Ensure that verifyToken and verifySeller middlewares are already defined and imported.

app.get('/seller-statistics', verifyToken, verifySeller, async (req, res) => {
    try {
        const sellerEmail = req.user.email; // Seller এর ইমেইল

        // Aggregate seller's total orders and total sales (price)
        const sellerStatistics = await OrderCollection.aggregate([
            { $match: { seller: sellerEmail } },
            { 
                $group: { 
                    _id: null, 
                    totalOrders: { $sum: 1 }, 
                    totalPrice: { $sum: { $toDouble: "$price" } } 
                } 
            }
        ]).toArray();

        // Fetch all orders for this seller, including the nested customer object.
        const orders = await OrderCollection.find({ seller: sellerEmail })
            .project({ _id: 1, customer: 1, orderDate: 1, price: 1 })
            .sort({ orderDate: -1 })
            .toArray();

        res.send({
            totalOrders: sellerStatistics[0]?.totalOrders || 0,
            totalPrice: sellerStatistics[0]?.totalPrice || 0,
            orders
        });

    } catch (error) {
        console.error("Error fetching seller statistics:", error);
        res.status(500).send({ error: "Internal Server Error" });
    }
});






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
