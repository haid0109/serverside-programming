import express from 'express';
import https from 'https';
import { auth } from 'express-openid-connect';
import { Sequelize, DataTypes } from 'sequelize';
import { readFileSync } from 'fs';
import cryptoJs from 'crypto-js';

const aes = cryptoJs.AES
const key = 'super secret key that should be stored in production server secrets or something, but is displayed here for testing/educational purposes'

//when running node in docker, the database is not accessible via the localhost because node and the db are running on different containers
//the database service name("db") must be used instead to indicate which service we are trying to connect to 
const host = process.env.host === 'docker' ? 'db' : 'localhost'
const sequelize = new Sequelize(`postgres://postgres:postgres@${host}:5432/postgres`, { //connects sequelize to postgres db
	logging: false,
});

const Todo = sequelize.define('Todo', { //creates todo model that makes creating and querying todos easier
  title: DataTypes.STRING,
	userId: DataTypes.STRING,
}, { freezeTableName: true });

sequelize.sync({ force: true }); //creates tables for our models if they dont exist

const app = express(); //creates express app

//makes it so html pages can be rendered using the ejs templating engine,
//all .ejs files in the /views directory can now be rendered by simply calling `res.render('<file_name>')`
app.set('view engine', 'ejs');

const authConfig = { //auth0 config
  authRequired: true, //requires user to be authenticated before visiting any route
  auth0Logout: true,
  secret: 'super secret auth0 config secret that should be stored in production server secrets or something, but is displayed here for testing/educational purposes',
  baseURL: 'https://localhost:7890',
  clientID: 'bTZAdx3uQHCMni6bf3mO81jSz8QJI2pa',
  issuerBaseURL: 'https://haidar.eu.auth0.com'
};

app.use(auth(authConfig)); //delegates authentication to auth0

app.get('/', async (req, res) => {
	const todos = (await Todo.findAll({
			where: { userId: req.oidc.user.sub } //`req.oidc.user.sub` is the users unique identifier, given by auth0
		}))
		.map(todo => { //returns only the todo data and drops all the db metadata
			todo = todo.dataValues;
			todo.title = aes.decrypt(todo.title, key).toString(cryptoJs.enc.Utf8);
			return todo;
		});

	res.render('index', { todos }); //renders the index.ejs page found in /views directory and passes in the `todos` variable to the page
});

app.get('/verify-todos', async (req, res) => {
	const savedTodos = (await Todo.findAll({
			where: { userId: req.oidc.user.sub }
		}))
		.map(todo => {
			return {
				id: todo.dataValues.id,
				title: aes.decrypt(todo.title, key).toString(cryptoJs.enc.Utf8),
			};
		});

	// savedTodos.push({ id: 123, title: 'testHashVerification' }); //comment out to make test succeed

	const savedTodosHash = cryptoJs.SHA3(JSON.stringify(savedTodos)).toString()
	const incomingTodosHash = cryptoJs.SHA3(req.query.data).toString();

	res.render('verify-todos', { verified: savedTodosHash === incomingTodosHash });
});

app.post('/api/todo', express.json(), async (req, res) => { //`express.json()` is a middleware that is required in order for routes to receive json requests, the request body would be empty otherwise
	const todo = await Todo.create({
		title: aes.encrypt(req.body.title, key).toString(),
		userId: req.oidc.user.sub,
	});

	res.send({
		todo: {
			...todo.dataValues,
			title: req.body.title,
		}
	});
});

app.delete('/api/todo/:id', async (req, res) => {
	await Todo.destroy({
		where: {
			id: req.params.id,
			userId: req.oidc.user.sub,
		}
	});

	res.send();
});

app.use((req, res, next)=>{ //if client hits a non existing page
  res.render('404');
});

const server = https.createServer({ //creates server using self signed certificate
	key: readFileSync('./cert/localhost.key'),
	cert: readFileSync('./cert/localhost.crt'),
}, app);

server.listen(7890, async () => { //runs server
	console.log('server running on https://localhost:7890');
});
