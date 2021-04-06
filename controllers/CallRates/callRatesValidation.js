// Call rate validations
exports.callRateValidations = {
    name: "max:40|type:alphaNumericDash",
    prefix: "max:10",
    number_of_digits: "max:2|min:1|type:numeric",
    min_rate: "required|type:numeric",
    sec_rate: "required|type:double",
    currency_id: "max:11"
}

// Call rate result validations
exports.callRateResultValidations = {
    abbreviation: 'required|max:2',
    color: 'required|max:12',
    description: 'max:100',
    name: 'required|min:2|max:32|type:alphaNumericDash',
}