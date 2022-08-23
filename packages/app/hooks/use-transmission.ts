import * as React from "react";
import useSWR from "swr";
import TransmissionClient, {
  Methods,
  TorrentRemoveRequest,
} from "@remote-app/transmission-client";

import { ClientContext } from "../contexts/transmission-client";

function useTransmission(): TransmissionClient | undefined {
  return React.useContext(ClientContext);
}

export function useTorrents() {
  const client = useTransmission();
  return useSWR(
    client ? [client, "torrent-get-all"] : null,
    async () => {
      const response = await client?.request({
        method: "torrent-get",
        arguments: {
          fields: [
            "id",
            "name",
            "status",
            "peersConnected",
            "peersSendingToUs",
            "peersGettingFromUs",
            "percentDone",
            "rateDownload",
            "rateUpload",
            "uploadRatio",
            "uploadedEver",
            "totalSize",
            "recheckProgress",
            "eta",
          ],
        },
      });

      return response?.arguments?.torrents;
    },
    {
      refreshInterval: 5000,
      errorRetryCount: 3,
    }
  );
}

export function useSession() {
  const client = useTransmission();
  return useSWR(
    client ? [client, "session-get"] : null,
    async () => {
      const response = await client?.request({
        method: "session-get",
      });

      return response?.arguments;
    },
    {
      revalidateIfStale: false,
    }
  );
}

export function useFreeSpace() {
  const client = useTransmission();
  const { data: session } = useSession();
  return useSWR(
    client && session?.["download-dir"]
      ? [client, "free-space", session["download-dir"]]
      : null,
    async () => {
      if (!session?.["download-dir"]) {
        return;
      }

      const response = await client?.request({
        method: "free-space",
        arguments: {
          path: session["download-dir"],
        },
      });

      return response?.arguments;
    }
  );
}

export function useAddTorrent() {
  const client = useTransmission();
  const { mutate } = useTorrents();

  const magnet = React.useCallback(
    async (url: string) => {
      if (!client) {
        return;
      }

      try {
        await client?.request({
          method: "torrent-add",
          arguments: {
            filename: url,
          },
        });
      } catch (e) {
        console.warn(e);
      } finally {
        setTimeout(() => mutate(), 500);
      }
    },
    [client, mutate]
  );

  return { magnet };
}

export function useTorrentActions() {
  const client = useTransmission();
  const { mutate } = useTorrents();

  const createAction = React.useCallback(
    <
      T extends Extract<
        Methods,
        | "torrent-start"
        | "torrent-start-now"
        | "torrent-stop"
        | "torrent-verify"
        | "torrent-reannounce"
        | "torrent-remove"
      >
    >(
      action: T
    ) => {
      return async (
        ids: number | number[] | "recently-active" | null,
        params: T extends "torrent-remove"
          ? Pick<TorrentRemoveRequest, "delete-local-data"> | undefined
          : undefined = undefined
      ): Promise<void> => {
        if (!client) {
          return;
        }

        let args = {};
        if (ids) {
          args = { ids };
        }
        if (params) {
          args = { ...args, ...params };
        }

        try {
          await client.request({
            method: action,
            arguments: {
              ...args,
            },
          });
        } catch (e) {
          console.warn(e);
        } finally {
          setTimeout(() => mutate(), 500);
        }
      };
    },
    [client, mutate]
  );

  const start = createAction("torrent-start");
  const startNow = createAction("torrent-start-now");
  const stop = createAction("torrent-stop");
  const verify = createAction("torrent-verify");
  const reannounce = createAction("torrent-reannounce");
  const remove = createAction("torrent-remove");

  return { start, startNow, stop, verify, reannounce, remove };
}
