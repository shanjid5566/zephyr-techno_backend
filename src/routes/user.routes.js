import { Router } from 'express';

const userRoutes = Router();

userRoutes.get('/', (req, res) => {
	res.status(200).json({
		message: 'User routes are working',
	});
});

export default userRoutes;
