import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pushRouter from "./push";
import ejectRouter from "./eject";
import authRouter from "./auth";
import reposRouter from "./repos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(pushRouter);
router.use(ejectRouter);
router.use(reposRouter);

export default router;
