import 'dotenv/config';
import jwt from 'jsonwebtoken';
const payload = {
    email: 'testbackend@potta.com',
    id: 'db9a67d3-db56-43aa-997a-05f33ce8ba06', // ID from my psql query
    sub: 'db9a67d3-db56-43aa-997a-05f33ce8ba06',
    role: 'USER',
};
const secret = process.env.JWT_SECRET || 'supersecretkey';
const token = jwt.sign(payload, secret, { expiresIn: '1h' });
console.log('JWT Token for testbackend@potta.com:');
console.log(token);
