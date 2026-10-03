const mongoose = require('mongoose');
const Store = require('./models/Store');
const User = require('./models/User');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/medical_mini_store');
  const store = await Store.findOne();
  
  const req = {
    params: { id: store._id },
    body: { status: 'Active' }
  };
  
  let updateData = { ...req.body };
  if (req.body.status !== undefined) {
    updateData.status = req.body.status;
    updateData.isActive = req.body.status === 'Active';
  } 

  const updatedStore = await Store.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
  console.log("Updated Store:", updatedStore.status, updatedStore.isActive);
  
  if (updateData.isActive !== undefined) {
    await User.updateMany({ storeId: store._id }, { isActive: updateData.isActive });
  }
  
  process.exit(0);
}
run();
