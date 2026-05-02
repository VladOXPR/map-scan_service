import { CuubClient } from "@cuub/shared";
import { CUUB_API_BASE } from "./config";

export const cuubClient = new CuubClient({ baseUrl: CUUB_API_BASE });
