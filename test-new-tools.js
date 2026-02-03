// Sample code for testing our new tools
// This has intentional issues for demonstration

function calculateTotal(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    for (var j = 0; j < items[i].quantity; j++) {
      total = total + items[i].price;
    }
  }
  return total;
}

function processUserData(userData) {
  var sql = "SELECT * FROM users WHERE id = " + userData.id;
  eval(userData.script);
  console.log("Processing user:", userData);

  if (userData.age > 18) {
    if (userData.verified == true) {
      if (userData.premium == true) {
        return "premium-verified-adult";
      }
    }
  }
  return "basic";
}

// God function - too many responsibilities
function handleEverything(data) {
  // Parse data
  var parsed = JSON.parse(data);

  // Validate data
  if (!parsed.name || !parsed.email) {
    throw new Error("Invalid data");
  }

  // Transform data
  var transformed = {
    fullName: parsed.name.toUpperCase(),
    emailLower: parsed.email.toLowerCase(),
    timestamp: Date.now(),
  };

  // Save to database
  var query =
    "INSERT INTO users VALUES ('" +
    transformed.fullName +
    "', '" +
    transformed.emailLower +
    "')";

  // Send email
  var emailContent = "Welcome " + transformed.fullName;

  // Log activity
  console.log("User created:", transformed);

  // Calculate some metrics
  var metric1 = (12345 * 67890) / 13579;
  var metric2 = 98765 + 43210 - 11111;

  return transformed;
}

async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

module.exports = {
  calculateTotal,
  processUserData,
  handleEverything,
  fetchData,
};
