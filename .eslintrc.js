module.exports = {
  env: {
    node: true,
    browser: true,
    es2021: true,
  },
  extends: ['eslint:recommended'], // فقط قوانین پایه و مهم
  parserOptions: {
    ecmaVersion: 2021,
  },
  rules: {
    // غیرفعال کردن قوانین مزاحم
    'no-unused-vars': 'warn', // به جای خطا، فقط هشدار
    'no-undef': 'error', // متغیر تعریف نشده -> خطا (همان چیزی که می‌خواهید)
    'no-console': 'off', // console.log مجاز
    'no-extra-semi': 'off', // ویرگول اضافه مجاز
    'no-constant-condition': 'off',
    'no-empty': 'off',
    'no-prototype-builtins': 'off',
    'no-useless-escape': 'off',
    'no-unused-expressions': 'off',
    'no-unreachable': 'warn',
  },
};
