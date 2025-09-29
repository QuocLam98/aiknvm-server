import Decimal from 'decimal.js'


const calculateCost = (usage: any, isEdit: boolean): Decimal => {
  if (isEdit == false) {
    const priceTokenInputText = new Decimal(0.000005);
    // const priceTokenInputImage = new Decimal(0.00001);
    const priceTokenOutput = new Decimal(0.00004);

    const priceTokenRequestText = new Decimal(usage.input_tokens_details.text_tokens);
    const priceTokenRequestImage = new Decimal(usage.input_tokens_details.image_tokens);
    const priceTokenResponse = new Decimal(usage.output_tokens);

    const totalCostInputText = priceTokenRequestText.mul(priceTokenInputText).mul(5);
    // const totalCostInputImage = priceTokenRequestImage.mul(priceTokenInputImage).mul(5);
    const totalCostOutput = priceTokenResponse.mul(priceTokenOutput).mul(5);

    return totalCostInputText.add(totalCostOutput);
  }
  else {
    const priceTokenInputText = new Decimal(0.000005);
    const priceTokenInputImage = new Decimal(0.00001);
    const priceTokenOutput = new Decimal(0.00004);

    const priceTokenRequestText = new Decimal(usage.input_tokens_details.text_tokens);
    const priceTokenRequestImage = new Decimal(usage.input_tokens_details.image_tokens);
    const priceTokenResponse = new Decimal(usage.output_tokens);

    const totalCostInputText = priceTokenRequestText.mul(priceTokenInputText).mul(5);
    const totalCostInputImage = priceTokenRequestImage.mul(priceTokenInputImage).mul(5);
    const totalCostOutput = priceTokenResponse.mul(priceTokenOutput).mul(5);

    return totalCostInputText.add(totalCostOutput).add(totalCostInputImage);
  }
}

export default calculateCost