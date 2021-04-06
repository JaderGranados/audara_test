const pool = require("../../config/db");
const {checkConfConnection, callConfApi} = require("../../helpers/serverTools");
const {callRateValidations} = require("./callRatesValidation");
const validateForm = require("../../validations/validator");

const successCode = "2901";
const errorCode = "2904";

const serverError = {
  code: errorCode,
  msg: {
    error: "serverError",
  },
};

exports.handleCode = async (apiCode, req, res) => {
  try {
    switch (apiCode) {
      // Show callRate
      case "2500":
        return await showCallRate(req, res);

      case "2510":
        return await createRateQueue(req, res);
      
      case "2511":
        return await callRateList(req, res);

      case "2512":
        return await updateRateQueue(req, res);

      case "2513":
        return await deleteCallRate(req, res);
      case "2514":
        return await enableCallRate(req, res);
      case "2515":
        return await disableCallRate(req, res);
      case "2519":
        return await basicListCallRate(req, res);
      case "2518":
        return await basicListCallCurrencies(req, res);
      // Default
      default:
        return res.status(500).json(serverError);
    }
  } catch (error) {
    
    console.log(error.message);
    return res.status(500).json(serverError);
  }
};

showCallRate = async (req, res) => {
  const rateId = parseInt(req.query.id) || "";

  // If id is empty
  if (rateId === "") {
    return res.status(200).json({
      code: errorCode,
      msg: {
        error: "id is empty",
      },
    });
  }

  // Gets queue data
  const result = await getRateData(rateId);

  // Not found
  if (!result) {
    return res.status(200).json({
      code: errorCode,
      msg: {
        error: "notFoundError",
      },
    });
  }

  return res.status(200).json({
    code: successCode,
    msg: {
      data: result,
    },
  });
};

// Create callRate (2510)
const createRateQueue = async (req, res) => {
  try {
    const dataRate = req.body;

    // Validates form
    const formErrors = validateForm(dataRate, callRateValidations);

    if (formErrors) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: formErrors,
        }
      });
    }

    // Checks .conf connection
    const validConfConnection = await checkConfConnection();

    if (!validConfConnection) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: ".conf connection error",
        }
      });
    }

    // Checks that name is not in use
    const nameResult = await pool.query(
      `SELECT 
      id
      FROM rates 
      WHERE LOWER(name) = LOWER(?)`,
      
      [
        `${dataRate.name}`
      ]
    );
    delete nameResult["meta"];
    
    if (nameResult.length > 0) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "Name already exists",
        }
      });
    }
    // Prepares data
    const dataKeys = Object.keys(dataRate);
    for (let i = 0; i < dataKeys.length; i++) {
      const key = dataKeys[i];

      // Removes '--' and ''
      if (dataRate[key] === '' || dataRate[key] === '--') delete dataRate[key];

      // Converts bool to string
      else if (dataRate[key] === true) dataRate[key] = 'TRUE';
      else if (dataRate[key] === false) dataRate[key] = 'FALSE';
    }
    
    // Saves queue in
    const saveQueueResult = await pool.query(
      `INSERT INTO
      rates 
      (${Object.keys(dataRate).join(',')})
      VALUES ? `,

      [
        Object.keys(dataRate).map(key => dataRate[key])
      ]
    ); 
    delete saveQueueResult["meta"];

    // If it was not created
    if (saveQueueResult['insertId'] === 0){
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "Record not created",
        }
      });
    }

    // Call .conf api
    const confResponse = await callConfApi('/rates.php', {action: "Create", name: dataRate.name});

    // If .conf failed
    if (confResponse.data.state !== 'OK' || confResponse.data.log !== 'Complete') {
      // Delete records
      await Promise.all([
        pool.query(`DELETE FROM rates WHERE id = ?`, [saveQueueResult['insertId']])
      ])

      // Throw error
      throw "rates .conf error";
    }

    // Get queue data
    const showResult = await getRateData(saveQueueResult['insertId']);
    
    return res.status(200).json({
      code: successCode,
      msg: {
        data: showResult,
      }
    });
  }
  catch (error) {
    console.log(error)
    return res.status(500).json(serverError);
  }
}

// Update callRate (2510)
const updateRateQueue = async (req, res) => {
  try {
    const rateId = parseInt(req.query.id) || '';
    const dataRate = req.body;

    // If id is empty
    if (rateId === '') {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "id is empty",
        }
      });
    }

    // Validates form
    const formErrors = validateForm(dataRate, callRateValidations);

    if (formErrors) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: formErrors,
        }
      });
    }

    // Checks .conf connection
    const validConfConnection = await checkConfConnection();

    if (!validConfConnection) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: ".conf connection error",
        }
      });
    }

    // Checks that name is not in use
    const nameResult = await pool.query(
      `SELECT 
      id
      FROM rates 
      WHERE LOWER(name) = LOWER(?) AND id <> ?`,
      
      [
        `${dataRate.name}`,
        rateId
      ]
    );
    delete nameResult["meta"];
    
    if (nameResult.length > 0) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "Name already exists",
        }
      });
    }
    // Prepares data
    const dataKeys = Object.keys(dataRate);
    for (let i = 0; i < dataKeys.length; i++) {
      const key = dataKeys[i];

      // Removes '--' and ''
      if (dataRate[key] === '' || dataRate[key] === '--') delete dataRate[key];

      // Converts bool to string
      else if (dataRate[key] === true) dataRate[key] = 'TRUE';
      else if (dataRate[key] === false) dataRate[key] = 'FALSE';
    }
    
    /// Update queue in
    const updateQueueResult = await pool.query(
      `UPDATE
      rates
      SET
      ${Object.keys(dataRate).map(key => `${key} = ${dataRate[key] !== '' ? '?' : 'NULL'}`).join(',')}
      WHERE id = ?`,

      [
        ...Object.keys(dataRate).filter(key => dataRate[key] !== '').map(key => dataRate[key]),
        rateId
      ]
    ); 
    delete updateQueueResult["meta"]; 

    // If it was not created
    if (saveQueueResult['insertId'] === 0){
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "Record not created",
        }
      });
    }

    // Call .conf api
    const confResponse = await callConfApi('/rates.php', {action: "Update", name: dataRate.name});

    // If .conf failed
    if (confResponse.data.state !== 'OK' || confResponse.data.log !== 'Complete') {
      // Delete records
      await Promise.all([
        pool.query(`DELETE FROM rates WHERE id = ?`, [saveQueueResult['insertId']])
      ])

      // Throw error
      throw "rates .conf error";
    }

    // Get queue data
    const showResult = await getRateData(saveQueueResult['insertId']);
    
    return res.status(200).json({
      code: successCode,
      msg: {
        data: showResult,
      }
    });
  }
  catch (error) {
    console.log(error)
    return res.status(500).json(serverError);
  }
}

// CallRate list (2911)
const callRateList = async (req, res) => {
  try {
    const filters = req.body.filters || {};

    const perpage = Number(req.body.perpage || 10);
    const page = Number(req.body.page || 1);

    const orderField = String(req.body.orderField || "name");
    const order = String(req.body.order || "asc");

    const name = String(filters.name || '');

    // Order must be "asc" or "desc"
    if (!(["asc", "desc"].includes(order.toLowerCase()))) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "order must be asc or desc",
        }
      });
    }

    // Orderfield must be one of the following fields
    const orderFields = ["name", "status", "prefix", "min_rate", "currency_id"];

    if (!(orderFields.includes(orderField.toLowerCase()))) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "Invalid orderField",
        }
      });
    }

    // WHERE query
    const whereQuery = name.length > 0 ? `WHERE r.name LIKE CONCAT(?, '%')` : '';

    // WHERE parameters
    const whereParam = [
      ...(name.length > 0 ? [name] : [])
    ]

    // Gets list data
    const resultData = await pool.query(
      `SELECT 
      r.id,
      r.min_rate,
      r.sec_rate,
      IFNULL(r.prefix, '') as prefix,
      IFNULL(r.number_of_digits, '') as number_of_digits,
      IFNULL(r.name, '') as name,
      cr.name as currency,
      IFNULL(r.status, '') as status
      FROM rates q
      LEFT JOIN currencies cr ON cr.id = q.currency_id
      ${whereQuery}
      GROUP BY r.id
      ORDER BY ${orderField} ${order} 
      LIMIT ? 
      OFFSET ?`,
      
      [
        ... whereParam,
        perpage,
        ((page - 1) * perpage),
      ]
    );
    delete resultData["meta"];
    
    // Gets totals data
    const resultTotals = await pool.query(
      `SELECT 
        COUNT(DISTINCT id) AS records 
      FROM queues_in q
      ${whereQuery}`,

      [
        ... whereParam
      ]
    );

    delete resultTotals["meta"];

    // Checks for errors
    if (!resultTotals) {
      throw "resultTotals error";
    }

    // If resultData is empty
    if (resultData.length < 1) {
      return res.status(200).json({
        code: successCode,
        msg: {
          data: resultData,
        }
      });
    }

    // Structures list data
    const listData = [];
    for (let i = 0; i < resultData.length; i++) {                
      const item = resultData[i];
      listData.push({
        id: item.id,
        tr: [
          {
            td: 'name',
            value: item.name,
          },
          {
            td: "currency",
            value: item.currency !== '' ? item.currency : false
          },
          {
            td: "prefix",
            value: item.prefix !== '' ? item.prefix : false
          },
          {
            td: "number_of_digits",
            value: item.number_of_digits !== '' ? item.number_of_digits : false
          },
          {
            td: "min_rate",
            value: item.min_rate
          },
          {
            td: "sec_rate",
            value: item.sec_rate
          },
          {
            td: "status",
            value: item.status
          }
        ]
      })
    }
    
    // Return list data
    const totalhits = resultTotals.reduce((accumulator, currentValue) => accumulator += currentValue.records, 0);
    return res.status(200).json({
      code: successCode,
      msg: {
        data: listData,
        from: ((page - 1) * perpage) + 1,
        to: Math.min(((page - 1) * perpage) + perpage, totalhits),
        per_page: Number(perpage),
        totalhits: totalhits,
        current_page: Number(page)
      }
    });
  } 
  catch (error) {
    return res.status(500).json(serverError);
  }
}


// Delete callRate (2913)
const deleteCallRate = async (req, res) => {
  try {
    const rateId = parseInt(req.query.id) || '';

    // If id is empty
    if (rateId === ''){
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "id is empty",
        }
      });
    }

    // Checks .conf connection
    const validConfConnection = await checkConfConnection();

    if (!validConfConnection) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: ".conf connection error",
        }
      });
    }
  
    // Gets queue data
    const rateResult = await pool.query(`SELECT * FROM rates WHERE id = ?`, [rateId]);
    delete rateResult["meta"];
    
    // Not found
    if (!rateResult || rateResult.length < 1) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "notFoundError",
        }
      });
    }

    // Delete rate
    await pool.query(`DELETE FROM rates WHERE id = ? `, [rateId]);

    // Call .conf api
    const confResponse = await callConfApi('/rates.php', {action: "Delete", name: rateResult[0].name});

    // If .conf failed
    if (confResponse.data.state !== 'OK' || confResponse.data.log !== 'Complete') {
      // Rollback queue
      const rollbackRateResult = await pool.query(
        `INSERT INTO rates (${Object.keys(rateResult[0]).filter(key => rateResult[0][key] !== null).join(',')}) VALUES ?`,
        [
          Object.keys(rateResult[0]).filter(key => rateResult[0][key] !== null).map(key => rateResult[0][key])
        ]
      ); 
      delete rollbackRateResult["meta"];

      // Throw error
      throw "rates .conf error";
    }

    // If everything is OK, return success response
    return res.status(200).json({
      code: successCode,
      msg: {
        data: {
          delete: true
        }
      }
    });
  } 
  catch (error) {
    return res.status(500).json(serverError);
  }
}

// Enable callRate (2914)
const enableCallRate = async (req, res) => {
  try {
    const rateId = parseInt(req.query.id) || '';

    // If id is empty
    if (rateId === ''){
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "id is empty",
        }
      });
    }
  
    // Checks if record exists
    const existResult = await pool.query(`SELECT id, name, status FROM rates WHERE id = ?`, [rateId]);
    delete existResult["meta"];
    
    // Not found
    if (!existResult || existResult.length < 1) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "notFoundError",
        }
      });
    }

    // Checks .conf connection
    const validConfConnection = await checkConfConnection();

    if (!validConfConnection) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: ".conf connection error",
        }
      });
    }

    // Change status to ACTIVE
    const resultUpdate = await pool.query(`UPDATE rates SET status = 'ACTIVE' WHERE id = ?`, [rateId]); 

    // If status was not updated
    if (resultUpdate['affectedRows'] === 0){
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "Status not updated!",
        }
      });
    }

    // Call .conf api
    const confResponse = await callConfApi('/rates.php', {action: "Update", name: existResult[0].name});

    // If .conf failed
    if (confResponse.data.state !== 'OK' || confResponse.data.log !== 'Complete') {
      // Rollback status change
      await pool.query(`UPDATE rates SET status = ? WHERE id = ?`, [existResult[0].status, rateId]); 

      // Throw error
      throw "rates .conf error";
    }

    // If everything is OK, return success response
    return res.status(200).json({
      code: successCode,
      msg: {
        data: {
          active: true
        }
      }
    });
  } 
  catch (error) {
    return res.status(500).json(serverError);
  }
}

// Disable callRate (2915)
const disableCallRate = async (req, res) => {
  try {
    const rateId = parseInt(req.query.id) || '';
  
    // Checks if record exists
    const existResult = await pool.query(`SELECT id, name, status FROM rates WHERE id = ?`, [rateId]);
    delete existResult["meta"];
    
    // Not found
    if (!existResult || existResult.length < 1) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "notFoundError",
        }
      });
    }

    // Checks .conf connection
    const validConfConnection = await checkConfConnection();

    if (!validConfConnection) {
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: ".conf connection error",
        }
      });
    }

    // Change status to INACTIVE
    const resultUpdate = await pool.query(`UPDATE rates SET status = 'INACTIVE' WHERE id = ?`, [rateId]); 

    // If status was not updated
    if (resultUpdate['affectedRows'] === 0){
      return res.status(200).json({
        code: errorCode,
        msg: {
          error: "Status not updated!",
        }
      });
    }

    // Call .conf api
    const confResponse = await callConfApi('/rates.php', {action: "Update", name: existResult[0].name});

    // If .conf failed
    if (confResponse.data.state !== 'OK' || confResponse.data.log !== 'Complete') {
      // Rollback status change
      await pool.query(`UPDATE rates SET status = ? WHERE id = ?`, [existResult[0].status, rateId]); 

      // Throw error
      throw "rates .conf error";
    }

    // If everything is OK, return success response
    return res.status(200).json({
      code: successCode,
      msg: {
        data: {
          inactive: true
        }
      }
    });
  } 
  catch (error) {
    return res.status(500).json(serverError);
  }
}

// Basic list callRate (2920)
const basicListCallRate = async (_req, res) => {
  try {
    // Get queue data
    const ratesResult = await pool.query(
      `SELECT 
        id,
        name,
        prefix,
        number_of_digits,
        min_rate,
        sec_rate,
        currency_id,
        status
      FROM rates 
      ORDER BY name asc`
    );
    delete ratesResult["meta"];

    // Returns data
    return res.status(200).json({
      code: successCode,
      msg: {
        data: ratesResult
      }
    });
  }
  catch (error) {
    return res.status(500).json(serverError);
  }
};

// Basic list callCurrencies (2920)
const basicListCallCurrencies = async (_req, res) => {
  try {
    // Get queue data
    const currenciesResult = await pool.query(
      `SELECT 
        id,
        name,
        currency,
        symbol
      FROM currencies 
      ORDER BY name asc`
    );
    delete currenciesResult["meta"];

    // Returns data
    return res.status(200).json({
      code: successCode,
      msg: {
        data: currenciesResult
      }
    });
  }
  catch (error) {
    return res.status(500).json(serverError);
  }
};

// Internal functions
getRateData = async (id) => {
  // Gets queue data
  const result = await pool.query(`SELECT * FROM rates WHERE id = ?`, [id]);
  delete result["meta"];

  // Checks for errors
  if (!result || result.length < 1) return false;

  // Data
  const data = result[0];

  const currencyResult = await pool.query(
    `SELECT * FROM currencies WHERE id = ? `,
    [data.currency_id]
  );
  delete currencyResult["meta"];

  data.currency = currencyResult[0];

  return data;
};
