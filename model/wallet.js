const { Schema, model } = require("mongoose");

const walletSchema = Schema(
  {
    balance: { type: Number, default: 0 },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
  },
  { timestamps: true }
);

module.exports = model("wallet", walletSchema);
