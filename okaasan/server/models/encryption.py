from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Text, UniqueConstraint, JSON, create_engine, select, Boolean, Index
from sqlalchemy.orm import relationship, sessionmaker, declarative_base

from .common import Base

#
# The goal here is to make an e2e encrypted KeyValue store
# and implement things like password manager on top of it
#

# I thing e2e encrypted chat is out of scope for this app
# class EncryptedChannel(Base):
#     __tablename__ = 'channels'
#     _id = Column(Integer, primary_key=True)

#     # Actually the conversation needs to be encrypted in a way that both
#     # people can decrypt the messages
#     # The clients need to derive a shared key


# class EncryptedConversation(Base):
#     __tablename__ = 'conversations'

#     _id         = Column(Integer, primary_key=True)
#     chanel_id   = Column(Integer, ForeignKey('channels._id'))
#     message_id  = Column(Integer, ForeignKey('messages._id'))


#
# Not sure if that exploded view is that interesting
# maybe we should just encrypt a blob of info for a given website


class PasswordManager(Base):
    __tablename__ = 'passwords'

    namespace = Column(String(256), unique=True)   # Clear
    password_id  = Column(Integer, ForeignKey('messages._id'))
    recovery_codes_id = Column(Integer, ForeignKey('messages._id'))

    security_question_1_id = Column(Integer, ForeignKey('messages._id'))
    security_question_2_id = Column(Integer, ForeignKey('messages._id'))
    security_question_3_id = Column(Integer, ForeignKey('messages._id'))
    security_question_4_id = Column(Integer, ForeignKey('messages._id'))
    security_question_5_id = Column(Integer, ForeignKey('messages._id'))


# Use encrypter username + password (to be decoded on the client)
# but clear website name
#   We encrypt (website + salt + username) (website + salt + password)
#
class EncryptedStorage(Base):
    #
    #   Generic Encrypted storage for 1024 bit length messages
    #
    __tablename__ = 'messages'
    
    _id = Column(Integer, primary_key=True)

    namespace = Column(String(256), unique=True)   # Clear
    seed      = Column(String(256), unique=True)   # Clear | nonce
    key       = Column(String(256))                # Encrypted AES KEY
    message   = Column(String(1024))               # Encrypted message using AES
    

    # Server
    # Generate random AES key K
    # Encrypt (username, password) → C = AES_Encrypt(K, plaintext)
    # Encrypt K → E_K = RSA_Encrypt(ClientPublicKey, K)
    # Store (E_K, C) in database

    # Client
    # Load (E_K, C)
    # Decrypt E_K → K = RSA_Decrypt(ClientPrivateKey, E_K)
    # Decrypt C → plaintext = AES_Decrypt(K, C)

