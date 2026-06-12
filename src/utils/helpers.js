const moment = require('moment-jalali');

function getReserveTimestamp(jalaliDate, timeStr) {
  // تبدیل ارقام فارسی به انگلیسی (در صورت وجود)
  const toEnglishDigits = (str) =>
    str.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const cleanDate = toEnglishDigits(jalaliDate);
  const cleanTime = toEnglishDigits(timeStr);
  const datetime = `${cleanDate} ${cleanTime}`;
  const m = moment(datetime, 'jYYYY/jMM/jDD HH:mm');
  return m.valueOf(); // تایم‌استمپ میلی‌ثانیه
}
module.exports = {
  getReserveTimestamp,
};
