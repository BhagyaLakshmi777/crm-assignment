const http = require('node:http');

const express = require("express");
const path = require("path");

const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');

const {open} = require("sqlite");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(express.json());

require("dotenv").config();  

const dbPath = path.join(__dirname, process.env.DB_FILENAME || "crm.db");

const hostname = process.env.HOSTNAME || '127.0.0.1';
const port = process.env.PORT || 3000; 
const secretToken = process.env.SECRETTOKEN || "MY_SECRET_TOKEN"

let db = null;


const initializeDbAndServer = async () => { 
  try{
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    })
    app.listen(port, hostname, ()=>{
      console.log(`Server is running: http://${hostname}:${port}/`)

    })
  }catch(e){
    console.log(`DB error: ${e.message}`)
    process.exit(-1)
  }

}
initializeDbAndServer()   

//api 1 

app.post("/api/employees/register", async (request,response) =>{
  const {email, password, name} = request.body;
  const hashPassword = await bcrypt.hash(password, 10)
  const selectUserQuery = `
                            SELECT * FROM Employee
                            WHERE email = '${email}';
  `;
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined){
    const createUser = ` 
        INSERT INTO Employee (name, email, password) VALUES ('${name}', '${email}', '${hashPassword}');
     `;
     await db.run(createUser)
     response.status(200)
     response.send("User Created Successfully")
  }
  else{
    response.status(400);
    response.send("User Already Exists")
  }
  
})

//api 2 

app.post("/api/employees/login", async (request, response) =>{
  const {email, password} = request.body;
  const selectUserQuery = `
                            SELECT * FROM Employee
                            WHERE email = '${email}';
  `;
   const dbUser = await db.get(selectUserQuery);
   console.log(dbUser)
    if (dbUser === undefined){
      response.status(400)
      response.send("Invalid User")
    }
    else{
      const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
      if (isPasswordMatch){
        const payload = {id: dbUser.id}
        console.log(payload)
        const jwtToken = jwt.sign(payload, '${secretToken}')
        response.send({jwtToken})
      }
      else{
        response.status(400)
        response.send("Invalid Password")
      }
    }

})
//api 3
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Unauthorized");
  } else {
    jwt.verify(jwtToken, '${secretToken}', async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Unauthorized");
      } else {
        request.id = payload.id
        next();
      }
    });
  }
};
//api 4 
app.post("/api/enquiries/public", async (request, response)=> {
 const {id, name, email, courseInterest} = request.body;
 const insertQuery = `
                     INSERT INTO Enquiry(id, name, email, courseInterest, claimed, counselorId) VALUES(${id}, '${name}', '${email}', '${courseInterest}', 0, NULL)
    `;
 await db.run(insertQuery)
 response.status(201);
 response.send("Created")
})

//api 5 
app.get("/api/enquiries/public", authenticateToken, async (request,response)=>{
  const selectEnquiry = `
                           SELECT * FROM Enquiry 
                           WHERE claimed = 0 AND counselorId IS NULL;
  `;
  const dbEnquiries = await db.all(selectEnquiry);
  response.status(200)
  response.send(dbEnquiries)
})

//api 6  
app.get("/api/enquiries/private", authenticateToken, async (request,response)=>{
  const {id} = request
   const selectEnquiry = `
                           SELECT * FROM Enquiry 
                           WHERE counselorId = ${id};
  `;
  const dbEnquiries = await db.get(selectEnquiry)
  response.status(201);
  response.send(dbEnquiries)

})

//api 7 
app.patch("/api/enquiries/:id/claim", authenticateToken, async (request, response)=>{
  const {id} = request.params;
   console.log(request.id)
  
    const selectEnquiry = `
                           SELECT * FROM Enquiry 
                           WHERE id = ${id};
  `;
  const dbResponse = await db.get(selectEnquiry);
  console.log(dbResponse)
 
   if (dbResponse.claimed === 1){
    response.status(409);
    response.send("Conflict")
  }
  else{
    const updateQuery =` UPDATE Enquiry SET claimed = 1, counselorId = ${request.id}
                          WHERE id = ${id};
    `;
    await db.run(updateQuery)
    const selectEnquiry = `SELECT * FROM Enquiry 
                           WHERE id = ${id};
                          `;
    const dbResponse = await db.get(selectEnquiry);
    response.send(dbResponse)


  }
})
