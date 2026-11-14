import js from '@eslint/js';
import globals from 'globals';

// Cấu hình tối thiểu: bắt lỗi thật (biến chưa khai báo, trùng key…), mức "warn" cho phần còn lại
// để áp dụng dần mà không chặn CI vì mã cũ.
export default [
  { ignores: ['dist/**', 'libs/**', 'js/**', 'node_modules/**', 'tests/*.json'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',
      'no-inner-declarations': 'warn',
      'no-cond-assign': 'warn',
      'no-redeclare': 'warn', // var lặp trong cùng hàm (excel-export.js) — vô hại, sửa dần
      'no-control-regex': 'warn',
    },
  },
];
