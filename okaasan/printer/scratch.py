

# Data: c0a8380146560000


# 44	80.091562	192.168.56.1	225.0.0.9	UDP	50	18006 → 19000 Len=8



# Your computer sends a UDP packet to the local broadcast address (e.g., 192.168.1.255)


# Computer → 192.168.1.255 UDP: DISCOVER_PRINTER
# Printer → Computer IP UDP: I_AM_A_PRINTER, MODEL XYZ


# # 
# filter: !tcp

# ip.addr == 192.168.2.192

# c0: 192
# a8: 168
# 02: 02
# 0b: 11

# 46520000

# 117577	122.741375	192.168.2.11	225.0.0.9	UDP	50	18002 → 19000 Len=8             Data: c0a8020b - 46520000                         | À¨FR
# 117578	122.741465	192.168.2.11	192.168.2.255	UDP	62	18003 → 48899 Len=20        Data: 7777772e7573722e636e00000000000000000000 | www.usr.cn
# 117579	122.742012	192.168.2.192	192.168.2.11	UDP	182	19000 → 18002 Len=140                                                      | G3-1"Ã+q
# 117580	122.742514	192.168.2.192	192.168.2.11	UDP	182	48899 → 18003 Len=140                                                      | G3-1"Ã+q





def discover(timeout=2.0):
    printers = []

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(timeout)

    # Bind to both local ports
    sock.bind(("", 18002))

    pkt1 = make_discovery_packet_1(PC_IP)
    # pkt2 = make_discovery_packet_2()

    # Send multicast discovery
    sock.sendto(pkt1, (MULTICAST_IP, DISCOVERY_PORT_1))

    # Send broadcast discovery
    # sock.sendto(pkt2, (BROADCAST_IP, DISCOVERY_PORT_2))

    start = time.time()
    while time.time() - start < timeout:
        try:
            data, addr = sock.recvfrom(2048)
            printers.append((addr[0], addr[1], data))
        except socket.timeout:
            break

    sock.close()
    return printers


import socket
import binascii
import time


class FlashForgeClient:
    def __init__(self, ip, port=8899, timeout=10):
        self.ip = ip
        self.port = port
        self.timeout = timeout
        self.sock = None

    def connect(self):
        self.sock = socket.create_connection((self.ip, self.port), self.timeout)

    def close(self):
        if self.sock:
            self.sock.close()
            self.sock = None

    def send(self, cmd):
        if not self.sock:
            raise RuntimeError("Not connected")

        payload = f"~{cmd}\r\n".encode()
        self.sock.sendall(payload)

        reply = self.sock.recv(4096)
        return reply

    def senddata(self, data, chunk_size=4096):
        """
        Send raw file bytes to the printer after M28 command.
        Splits into chunks to avoid overwhelming the socket.
        """
        if not self.sock:
            raise RuntimeError("Not connected")

        offset = 0
        total = len(data)
        while offset < total:
            end = min(offset + chunk_size, total)
            chunk = data[offset:end]
            self.sock.sendall(chunk)
            offset = end
            # Optional: small delay to avoid overwhelming the printer
            time.sleep(0.01)


def dump(reply):
    print("HEX:", binascii.hexlify(reply).decode())
    print("ASCII:\n", reply.decode(errors="ignore"))



def upload_file(path, chunk_size):
    
    with open(path, "rb") as fp:
        data = fp.read(-1)
    
    import os
    filename = os.path.basename(path)
    filesize = len(data)

    send_file = [
        "M601 S1",  # Control Command
        "M650",     # Guider Connect
        "M119",     # Status Command
        "M27",
        # f"M30 0:/user/{filename}",
        f"M28 {filesize} 0:/user/{filename}", # File Upload
    ]

    for i in send_file:
        dump(c.send(i))

    c.senddata(data, chunk_size=chunk_size)

    file_sent_end = [
        "M29",
    ]

    for i in file_sent_end:
        dump(c.send(i))

    time.sleep(1)
    print(filesize)

    


if __name__ == "__main__":
    c = FlashForgeClient("192.168.2.196")
    c.connect()

    dump(c.send(f"M601 S1"))
    dump(c.send(f"M20"))
    dump(c.send(f"M22"))
    dump(c.send(f"M21"))
    dump(c.send(f"M81"))
    dump(c.send(f"M17"))
    dump(c.send(f"G28"))
    dump(c.send(f"G29"))


    c.close()

    from time import sleep
    while True:
        sleep(1)
    


    # p = "/home/setepenre/work/website/before_print.gx"

    # import os
    # filename = os.path.basename(p)

    # upload_file(p, chunk_size=2048)

    # time.sleep(1)

    # # M23 => Select file 
    # # M24 => Resume
    # # M25 => Pause
    # # M27 => Print status
    # # M30 => delete
    
    # dump(c.send(f"M23 0:/user/{filename}"))

    # cmd = [
    #     # "M34"
    #     # "M81"

    #     # "M26" # <== CANCEL PRINT
    # ]
    # for i in cmd:
    #     dump(c.send(i))



   # M601 S1
    # M115
    # M650
    # M115
    # M114
    # M27
    # M119
    # M105
    # M119
    # M105
    # M27
    # M119
    # M28    ~M28 2900391 0:/user/WaterPitcher.gx
    # M29
    # M23
    # M27
    # M26 

    # # M601 (Pause Print)
    # #
    # # CMD M601 Received.
    # # Control Success V2.1.
    # # ok
    # r = c.send("M601") 
    # dump(r)

    # # M115 - Firmware Info
    # #
    # # CMD M115 Received.
    # # Machine Type: FlashForge Guider 3
    # # Machine Name: G3-1
    # # Firmware: v2.3.4
    # # SN: SNMMPB9C00002
    # # X: 300 Y: 250 Z: 340
    # # Tool Count: 1
    # # Mac Address:88:A9:A7:96:60:BA
    # r = c.send("M115") 
    # dump(r)

    # # 
    # # CMD M650 Received.
    # # X: 1.0 Y: 0.5
    # # ok
    # r = c.send("M650") 
    # dump(r)

    # # M114 - Get Current Position
    # #
    # # CMD M114 Received.
    # # X1:0 X2:0 Y:0 Z:0 A:0 B:0
    # # ok
    # r = c.send("M114") 
    # dump(r)

    # # M27 - Report SD print status
    # #
    # # CMD M27 Received.
    # # SD printing byte 0/100
    # # Layer: 0/0
    # # ok
    # r = c.send("M27") 
    # dump(r)

    # # Endstop States
    # # --------------
    # # CMD M119 Received.
    # # Endstop: X-max: 300 Y-max: 250 Z-min: 0
    # # MachineStatus: READY
    # # MoveMode: READY
    # # Status: S:1 L:0 J:0 F:0
    # # LED: 0
    # # CurrentFile: 
    # # ok
    # r = c.send("M119") 
    # dump(r)

    # # Report Temperature
    # # ------------------
    # # CMD M105 Received.
    # # T0:25/0 B:23/0
    # # ok
    # r = c.send("M105") 
    # dump(r)


    # dump(c.send("M140 S50")) #   ; start bed heating
    # dump(c.send("M104 S75")) #   ; start extruder heating

    # # # DID not trigger anything
    # dump(c.send("M601 S1"))
    # dump(c.send("M17"))
    # dump(c.send("G32"))

    # # dump(c.send("G28 O"))
    # dump(c.send("G28 O"))
    # dump(c.send("M85 S60"))
    # dump(c.send("M118 E1 Yello World!"))


    # dump(c.send("G27 P0"))
    # dump(c.send("M601 S1"))
    # dump(c.send("G0 X12"))
    

    # c
    # dump(c.send("M119"))
    # dump(c.send("M601 S1"))



    # dump(c.send("M190 S50"))
    # dump(c.send("M109 S50"))

    # r = c.send("G29 P5") 
    # dump(r)

    # r = c.send("M105")
    # dump(r)

    # c.close()

    # results = discover()

    # for ip, port, data in results:
    #     print(f"\nDiscovered device at {ip}:{port}")
    #     print("Raw reply:", data)
    #     try:
    #         print("ASCII:", data.decode(errors="ignore"))
    #     except Exception:
    #         pass



    # upload_file()