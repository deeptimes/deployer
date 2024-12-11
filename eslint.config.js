import antfu from '@antfu/eslint-config'

export default await antfu({
}, {
  rules: {
    'no-console': 'off',
    'unused-imports/no-unused-imports': 'off',
    'unused-imports/no-unused-vars': 'off',
    'no-unused-vars': 'off',
    'ts/no-unused-vars': 'off',
    // 'jsonc/array-bracket-spacing': ['error', 'never'],
  },
})
