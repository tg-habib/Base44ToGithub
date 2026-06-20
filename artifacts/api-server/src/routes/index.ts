import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pushRouter from "./push";
import ejectRouter from "./eject";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pushRouter);
router.use(ejectRouter);

export default router;
