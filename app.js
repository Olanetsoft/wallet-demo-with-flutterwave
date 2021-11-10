require("dotenv").config();
require("./config/database").connect();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// importing user context
const User = require("./model/user");
const Wallet = require("./model/wallet");
const WalletTransaction = require("./model/wallet_transaction");
const Transaction = require("./model/transaction");

const path = require("path");

const app = express();

app.use(express.json());

app.post("/register", async (req, res) => {
  // Our register logic starts here
  try {
    // Get user input
    const { first_name, last_name, email, password } = req.body;

    // Validate user input
    if (!(email && password && first_name && last_name)) {
      res.status(400).send("All input is required");
    }

    // check if user already exist
    // Validate if user exist in our database
    const oldUser = await User.findOne({ email });

    if (oldUser) {
      return res.status(409).send("User Already Exist. Please Login");
    }

    //Encrypt user password
    encryptedPassword = await bcrypt.hash(password, 10);

    // Create user in our database
    const user = await User.create({
      first_name,
      last_name,
      email: email.toLowerCase(), // sanitize: convert email to lowercase
      password: encryptedPassword,
    });

    // Create token
    const token = jwt.sign(
      { user_id: user._id, email },
      process.env.TOKEN_KEY,
      {
        expiresIn: "2h",
      }
    );
    // save user token
    user.token = token;

    // return new user
    res.status(201).json(user);
  } catch (err) {
    console.log(err);
  }
  // Our register logic ends here
});

app.post("/login", async (req, res) => {
  // Our login logic starts here
  try {
    // Get user input
    const { email, password } = req.body;

    // Validate user input
    if (!(email && password)) {
      res.status(400).send("All input is required");
    }
    // Validate if user exist in our database
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
      // Create token
      const token = jwt.sign(
        { user_id: user._id, email },
        process.env.TOKEN_KEY,
        {
          expiresIn: "2h",
        }
      );

      // save user token
      user.token = token;

      // user
      res.status(200).json(user);
    }
    res.status(400).send("Invalid Credentials");
  } catch (err) {
    console.log(err);
  }
  // Our login logic ends here
});

app.get("/pay", (req, res) => {
  res.sendFile(path.join(__dirname + "/index.html")); //__dirname : It will resolve to your project folder.
});

app.get("/response", async (req, res) => {
  const { transaction_id } = req.query;

  // URL with transaction ID of which will be used to confirm transaction status
  const url = `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`;

  // Network call to confirm transaction status
  const response = await axios({
    url,
    method: "get",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `${process.env.FLUTTERWAVE_V3_SECRET_KEY}`,
    },
  });

  const { status, currency, id, amount, customer } = response.data.data;

  // check if transaction id already exist

  const transactionExist = await Transaction.findOne({ transactionId: id });

  if (transactionExist) {
    return res.status(409).send("Transaction Already Exist");
  }
  // check if customer exist in our database
  const user = await User.findOne({ email: customer.email });

  // check if user have a wallet, else create wallet
  const wallet = await validateUserWallet(user._id);

  // create wallet transaction
  await createWalletTransaction(user._id, status, currency, amount);

  // create transaction
  await createTransaction(user._id, id, status, currency, amount, customer);

  await updateWallet(user._id, amount);

  return res.status(200).json({
    response: "wallet funded successfully",
    data: wallet,
  });
});

app.get("/wallet/:userId/balance", async (req, res) => {
  try {
    const { userId } = req.params;

    const wallet = await Wallet.findOne({ userId });
    // user
    res.status(200).json(wallet.balance);
  } catch (err) {
    console.log(err);
  }
});

const validateUserWallet = async (userId) => {
  try {
    // check if user have a wallet, else create wallet
    const userWallet = await Wallet.findOne({ userId });

    if (!userWallet) {
      // create wallet
      const wallet = await Wallet.create({
        userId,
      });
      return wallet;
    }
    return userWallet;
  } catch (error) {
    console.log(error);
  }
};

const createWalletTransaction = async (userId, status, currency, amount) => {
  try {
    // create wallet transaction
    const walletTransaction = await WalletTransaction.create({
      amount,
      userId,
      isInflow: true,
      currency,
      status,
    });
    return walletTransaction;
  } catch (error) {
    console.log(error);
  }
};

const createTransaction = async (
  userId,
  id,
  status,
  currency,
  amount,
  customer
) => {
  try {
    // create transaction
    const transaction = await Transaction.create({
      userId,
      transactionId: id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone_number,
      amount,
      currency,
      paymentStatus: status,
      paymentGateway: "flutterwave",
    });
    return transaction;
  } catch (error) {
    console.log(error);
  }
};

const updateWallet = async (userId, amount) => {
  try {
    // update wallet
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount } },
      { new: true }
    );
    return wallet;
  } catch (error) {
    console.log(error);
  }
};

module.exports = app;
