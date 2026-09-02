const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ message: "Route đang hoạt động bình thường!" });
});

module.exports = router; // Bắt buộc phải có dòng này để Express nhận diện được router