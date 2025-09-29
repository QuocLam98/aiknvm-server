import Elysia, { t } from "elysia";
import controllerAuthen from "./src/controllers/AuthenController";
import controllerBot from "./src/controllers/BotController";
import controllerUseBot from "./src/controllers/UserBotController";
import controllerMessage from "~/controllers/MessageController";
import "./src/providers/MongodbProvider";
import controllerFile from "~/controllers/FileManageController";
import controllerHistoryChat from "~/controllers/HistoryChatController";
import ControllerHistoryPayment from "~/controllers/HistoryPayment";
import controllerFileUserManage from "~/controllers/FileUserManageController";
import controllerField from "~/controllers/FieldController";
import controllerStore from "~/controllers/StoreController";

const routers = new Elysia()
  .use(controllerAuthen)
  .use(controllerAuthen)
  .use(controllerBot)
  .use(controllerUseBot)
  .use(controllerMessage)
  .use(controllerFile)
  .use(controllerHistoryChat)
  .use(ControllerHistoryPayment)
  .use(controllerFileUserManage)
  .use(controllerField)
  .use(controllerStore)
  
export default routers