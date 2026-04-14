import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  View,
  StatusBar,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  ScrollView,
  TextInput,
  Animated,
  Alert
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';

const { width } = Dimensions.get('window');

// Priority order for sorting
const PRIORITY_ORDER = {
  'CRITICAL': 1,
  'HIGH': 2,
  'MEDIUM': 3,
  'LOW': 4
};

const TicketsScreen = () => {
  const navigation = useNavigation();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- NEW STATE FOR CREATION ---
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    deviceSn: '',
    cargoValue: 0,
    incidentType: 'MANUAL',
  });

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;


  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchTickets();
      
      const backAction = () => {
        return false;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
    }, [])
    );





  const fetchTickets = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      
      const token = await AsyncStorage.getItem('accessToken');
      const userObj = await AsyncStorage.getItem('user');
      const user = userObj ? JSON.parse(userObj) : null;
      const userId = user?.id || await AsyncStorage.getItem('id');
      
      if (!token || !userId) {
        console.error('No token or user ID found');
        return;
      }

      const response = await axios.get(
        `${serverUrl}/tickets?page=0&size=10000000&sort=createdAt,desc`,


        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.data && response.data.content) {
        const ticketsData = response.data.content.map(t => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: t.status,
          assignedTo: t.assignee ? {
            id: t.assignee.userId,
            name: (t.assignee.firstName && t.assignee.lastName) 
              ? `${t.assignee.firstName} ${t.assignee.lastName}` 
              : (t.assignee.username || t.assignee.email || `User ${t.assignee.userId}`)
          } : null,
          reporter: t.reporter ? {
            id: t.reporter.userId,
            name: (t.reporter.firstName && t.reporter.lastName) 
              ? `${t.reporter.firstName} ${t.reporter.lastName}` 
              : (t.reporter.username || t.reporter.email || `User ${t.reporter.userId}`)
          } : null,
          sourceNotificationId: t.sourceNotificationId,
          deviceSerialNumber: t.deviceSerialNumber,
          geofenceName: t.geofenceName,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          resolvedAt: t.resolvedAt,
          closedAt: t.closedAt,
          comments: t.comments ? t.comments.map(c => ({
            id: c.id,
            user: c.author ? {
              id: c.author.userId,
              name: (c.author.firstName && c.author.lastName) 
                ? `${c.author.firstName} ${c.author.lastName}` 
                : (c.author.username || c.author.email || `User ${c.author.userId}`)
            } : { name: 'System' },
            text: c.content,
            oldStatus: c.oldStatus,
            newStatus: c.newStatus,
            createdAt: c.createdAt
          })) : [],
          read: false
        })).sort((a, b) => {
          const p1 = PRIORITY_ORDER[a.priority] || 99;
          const p2 = PRIORITY_ORDER[b.priority] || 99;
          if (p1 !== p2) return p1 - p2;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        setTickets(ticketsData);
      } else if (Array.isArray(response.data)) {
        // Handle case where response is array directly
        const ticketsData = response.data.map(t => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: t.status,
          assignedTo: t.assignee ? {
            id: t.assignee.userId,
            name: (t.assignee.firstName && t.assignee.lastName) 
              ? `${t.assignee.firstName} ${t.assignee.lastName}` 
              : (t.assignee.username || t.assignee.email || `User ${t.assignee.userId}`)
          } : null,
          reporter: t.reporter ? {
            id: t.reporter.userId,
            name: (t.reporter.firstName && t.reporter.lastName) 
              ? `${t.reporter.firstName} ${t.reporter.lastName}` 
              : (t.reporter.username || t.reporter.email || `User ${t.reporter.userId}`)
          } : null,
          sourceNotificationId: t.sourceNotificationId,
          deviceSerialNumber: t.deviceSerialNumber,
          geofenceName: t.geofenceName,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          resolvedAt: t.resolvedAt,
          closedAt: t.closedAt,
          comments: t.comments ? t.comments.map(c => ({
            id: c.id,
            user: c.author ? {
              id: c.author.userId,
              name: (c.author.firstName && c.author.lastName) 
                ? `${c.author.firstName} ${c.author.lastName}` 
                : (c.author.username || c.author.email || `User ${c.author.userId}`)
            } : { name: 'System' },
            text: c.content,
            oldStatus: c.oldStatus,
            newStatus: c.newStatus,
            createdAt: c.createdAt
          })) : [],
          read: false
        })).sort((a, b) => {
          const p1 = PRIORITY_ORDER[a.priority] || 99;
          const p2 = PRIORITY_ORDER[b.priority] || 99;
          if (p1 !== p2) return p1 - p2;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        setTickets(ticketsData);
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
      Snackbar.show({
        text: 'Failed to load tickets',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets(true);
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'open': return '#FFA500';
      case 'in-progress': return '#4CAF50';
      case 'resolved': return '#2196F3';
      case 'closed': return '#9E9E9E';
      default: return '#666';
    }
  };

  const getPriorityColor = (priority) => {
    switch(priority?.toUpperCase()) {
      case 'CRITICAL': return '#FF6B6B';
      case 'HIGH': return '#FFA500';
      case 'MEDIUM': return '#FFC107';
      case 'LOW': return '#4CAF50';
      default: return '#666';
    }
  };

  const getPriorityIcon = (priority) => {
    switch(priority?.toUpperCase()) {
      case 'CRITICAL': return '🔴';
      case 'HIGH': return '🟠';
      case 'MEDIUM': return '🟡';
      case 'LOW': return '🟢';
      default: return '⚪';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getFilteredTickets = () => {
    let filtered = [...tickets];
    
    // Apply status filter
    switch(filter) {
      case 'open':
        filtered = filtered.filter(t => t.status?.toLowerCase() === 'open');
        break;
      case 'in-progress':
        filtered = filtered.filter(t => t.status?.toLowerCase() === 'in-progress');
        break;
      case 'resolved':
        filtered = filtered.filter(t => t.status?.toLowerCase() === 'resolved');
        break;
      case 'closed':
        filtered = filtered.filter(t => t.status?.toLowerCase() === 'closed');
        break;
      case 'critical':
        filtered = filtered.filter(t => t.priority?.toUpperCase() === 'CRITICAL');
        break;
      default:
        break;
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.title?.toLowerCase().includes(query) ||
        t.ticketNumber?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.deviceSerialNumber?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  const getStatusCounts = () => {
    return {
      total: tickets.length,
      open: tickets.filter(t => t.status?.toLowerCase() === 'open').length,
      inProgress: tickets.filter(t => t.status?.toLowerCase() === 'in-progress').length,
      resolved: tickets.filter(t => t.status?.toLowerCase() === 'resolved').length,
      closed: tickets.filter(t => t.status?.toLowerCase() === 'closed').length,
      critical: tickets.filter(t => t.priority?.toUpperCase() === 'CRITICAL').length
    };
  };

  const addComment = async () => {
    if (!commentText.trim()) {
      Snackbar.show({
        text: 'Please enter a comment',
        duration: 2000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.post(
        `${serverUrl}/tickets/${selectedTicket.id}/comments`,
        { content: commentText },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      // Refresh ticket details
      await fetchTickets();
      
      // Update selected ticket
      const updatedTicket = tickets.find(t => t.id === selectedTicket.id);
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
      }
      
      setCommentText('');
      Snackbar.show({
        text: 'Comment added successfully',
        duration: 2000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Failed to add comment:', error);
      Snackbar.show({
        text: 'Failed to add comment',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateTicketStatus = async (newStatus) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.patch(
        `${serverUrl}/tickets/${selectedTicket.id}/status`,
        { status: newStatus },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      // Refresh tickets
      await fetchTickets();
      
      // Update selected ticket
      const updatedTicket = tickets.find(t => t.id === selectedTicket.id);
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
      }
      
      Snackbar.show({
        text: `Ticket status updated to ${newStatus}`,
        duration: 2000,
        backgroundColor: '#4CAF50',
      });
    } catch (error) {
      console.error('Failed to update status:', error);
      Snackbar.show({
        text: 'Failed to update status',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
    }
  };

  const renderTicket = ({ item, index }) => {
    const statusColor = getStatusColor(item.status);
    const priorityColor = getPriorityColor(item.priority);
    
    return (
      <Animatable.View 
        animation="fadeInUp" 
        delay={index * 80}
        duration={400}
        style={styles.animationWrapper}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            setSelectedTicket(item);
            setModalVisible(true);
          }}
        >
          <View style={styles.ticketCard}>
            <View style={styles.ticketHeader}>
              <View style={styles.ticketNumberContainer}>
                <Text style={styles.ticketNumber}>{item.ticketNumber || `#${item.id}`}</Text>
                <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '20' }]}>
                  <Text style={styles.priorityIcon}>{getPriorityIcon(item.priority)}</Text>
                  <Text style={[styles.priorityText, { color: priorityColor }]}>
                    {item.priority}
                  </Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {item.status || 'Open'}
                </Text>
              </View>
            </View>

            <Text style={styles.ticketTitle}>{item.title}</Text>
            <Text style={styles.ticketDescription} numberOfLines={2}>
              {item.description}
            </Text>

            <View style={styles.ticketFooter}>
              <View style={styles.footerItem}>
                <Text style={styles.footerIcon}>🕒</Text>
                <Text style={styles.footerText}>{formatDate(item.createdAt)}</Text>
              </View>
              {item.deviceSerialNumber && (
                <View style={styles.footerItem}>
                  <Text style={styles.footerIcon}>📱</Text>
                  <Text style={styles.footerText}>{item.deviceSerialNumber}</Text>
                </View>
              )}
              {item.geofenceName && (
                <View style={styles.footerItem}>
                  <Text style={styles.footerIcon}>📍</Text>
                  <Text style={styles.footerText}>{item.geofenceName}</Text>
                </View>
              )}
            </View>
            
            {item.comments && item.comments.length > 0 && (
              <View style={styles.commentsCount}>
                <Text style={styles.commentsIcon}>💬</Text>
                <Text style={styles.commentsText}>{item.comments.length} comments</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const renderHeader = () => {
    const counts = getStatusCounts();
    
    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Tickets</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('CreateTicket')}
            >
              <Text style={styles.createButtonText}>+ New</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search tickets..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.statsContainer}
          >
            <TouchableOpacity 
              style={[styles.statCard, filter === 'all' && styles.activeStatCard]}
              onPress={() => setFilter('all')}
            >
              <Text style={styles.statNumber}>{counts.total}</Text>
              <Text style={styles.statLabel}>All</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, filter === 'open' && styles.activeStatCard]}
              onPress={() => setFilter('open')}
            >
              <Text style={[styles.statNumber, { color: '#FFA500' }]}>{counts.open}</Text>
              <Text style={styles.statLabel}>Open</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, filter === 'in-progress' && styles.activeStatCard]}
              onPress={() => setFilter('in-progress')}
            >
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{counts.inProgress}</Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, filter === 'resolved' && styles.activeStatCard]}
              onPress={() => setFilter('resolved')}
            >
              <Text style={[styles.statNumber, { color: '#2196F3' }]}>{counts.resolved}</Text>
              <Text style={styles.statLabel}>Resolved</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, filter === 'closed' && styles.activeStatCard]}
              onPress={() => setFilter('closed')}
            >
              <Text style={[styles.statNumber, { color: '#9E9E9E' }]}>{counts.closed}</Text>
              <Text style={styles.statLabel}>Closed</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, filter === 'critical' && styles.activeStatCard]}
              onPress={() => setFilter('critical')}
            >
              <Text style={[styles.statNumber, { color: '#FF6B6B' }]}>{counts.critical}</Text>
              <Text style={styles.statLabel}>Critical</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Animated.View>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA500" />
          <Text style={styles.loadingText}>Loading tickets...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      
      <FlatList
        data={getFilteredTickets()}
        keyExtractor={item => item.id.toString()}
        renderItem={renderTicket}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#FFA500"
            colors={['#FFA500']}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Animatable.View animation="fadeIn" duration={500} style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🎫</Text>
            <Text style={styles.emptyTitle}>No tickets found</Text>
            <Text style={styles.emptyText}>
              {searchQuery 
                ? 'Try adjusting your search' 
                : filter !== 'all'
                ? `No ${filter} tickets available`
                : 'Create a new ticket to get started'}
            </Text>
          </Animatable.View>
        }
      />

      {/* Ticket Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animatable.View animation="slideInUp" duration={300} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ticket Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {selectedTicket && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Ticket Header */}
                <View style={styles.ticketDetailHeader}>
                  <Text style={styles.ticketDetailNumber}>
                    {selectedTicket.ticketNumber || `#${selectedTicket.id}`}
                  </Text>
                  <View style={[styles.statusBadgeLarge, 
                    { backgroundColor: getStatusColor(selectedTicket.status) + '20' }]}>
                    <Text style={[styles.statusTextLarge, { color: getStatusColor(selectedTicket.status) }]}>
                      {selectedTicket.status || 'Open'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.ticketDetailTitle}>{selectedTicket.title}</Text>
                <Text style={styles.ticketDetailDescription}>{selectedTicket.description}</Text>

                {/* Ticket Info Grid */}
                <View style={styles.infoGrid}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Priority</Text>
                    <View style={[styles.priorityBadgeLarge, 
                      { backgroundColor: getPriorityColor(selectedTicket.priority) + '20' }]}>
                      <Text style={styles.priorityIconLarge}>
                        {getPriorityIcon(selectedTicket.priority)}
                      </Text>
                      <Text style={[styles.priorityTextLarge, { color: getPriorityColor(selectedTicket.priority) }]}>
                        {selectedTicket.priority}
                      </Text>
                    </View>
                  </View>

                  {selectedTicket.deviceSerialNumber && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Device</Text>
                      <Text style={styles.infoValue}>{selectedTicket.deviceSerialNumber}</Text>
                    </View>
                  )}

                  {selectedTicket.geofenceName && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Geofence</Text>
                      <Text style={styles.infoValue}>{selectedTicket.geofenceName}</Text>
                    </View>
                  )}

                  {selectedTicket.assignedTo && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Assigned To</Text>
                      <Text style={styles.infoValue}>{selectedTicket.assignedTo.name}</Text>
                    </View>
                  )}

                  {selectedTicket.reporter && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Reported By</Text>
                      <Text style={styles.infoValue}>{selectedTicket.reporter.name}</Text>
                    </View>
                  )}

                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Created</Text>
                    <Text style={styles.infoValue}>
                      {new Date(selectedTicket.createdAt).toLocaleString()}
                    </Text>
                  </View>

                  {selectedTicket.updatedAt && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Last Updated</Text>
                      <Text style={styles.infoValue}>
                        {new Date(selectedTicket.updatedAt).toLocaleString()}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Status Update Section */}
                <View style={styles.statusUpdateSection}>
                  <Text style={styles.sectionTitle}>Update Status</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusButtons}>
                    {['Open', 'In-Progress', 'Resolved', 'Closed'].map(status => (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.statusButton,
                          selectedTicket.status?.toLowerCase() === status.toLowerCase() && styles.activeStatusButton
                        ]}
                        onPress={() => updateTicketStatus(status)}
                      >
                        <Text style={[
                          styles.statusButtonText,
                          selectedTicket.status?.toLowerCase() === status.toLowerCase() && styles.activeStatusButtonText
                        ]}>
                          {status}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Comments Section */}
                <View style={styles.commentsSection}>
                  <TouchableOpacity 
                    style={styles.commentsHeader}
                    onPress={() => setShowComments(!showComments)}
                  >
                    <Text style={styles.sectionTitle}>
                      Comments ({selectedTicket.comments?.length || 0})
                    </Text>
                    <Text style={styles.expandIcon}>
                      {showComments ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>

                  {showComments && (
                    <View style={styles.commentsList}>
                      {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                        selectedTicket.comments.map((comment, index) => (
                          <View key={comment.id || index} style={styles.commentItem}>
                            <View style={styles.commentHeader}>
                              <Text style={styles.commentUser}>{comment.user?.name || 'System'}</Text>
                              <Text style={styles.commentTime}>{formatDate(comment.createdAt)}</Text>
                            </View>
                            <Text style={styles.commentText}>{comment.text}</Text>
                            {comment.oldStatus && comment.newStatus && (
                              <Text style={styles.statusChangeText}>
                                Status changed from {comment.oldStatus} to {comment.newStatus}
                              </Text>
                            )}
                          </View>
                        ))
                      ) : (
                        <Text style={styles.noCommentsText}>No comments yet</Text>
                      )}
                    </View>
                  )}

                  <View style={styles.addCommentSection}>
                    <TextInput
                      style={styles.commentInput}
                      placeholder="Add a comment..."
                      placeholderTextColor="#999"
                      value={commentText}
                      onChangeText={setCommentText}
                      multiline
                      numberOfLines={3}
                    />
                    <TouchableOpacity 
                      style={[styles.submitCommentButton, submitting && styles.disabledButton]}
                      onPress={addComment}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.submitCommentText}>Post</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.closeModalButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.closeModalButtonText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Animatable.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  backButtonText: {
    fontSize: 28,
    color: '#1A1A1A',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  createButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FFA500',
    borderRadius: 8,
  },
  createButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
    color: '#999',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A',
  },
  clearIcon: {
    fontSize: 16,
    color: '#999',
    padding: 8,
  },
  statsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 70,
  },
  activeStatCard: {
    backgroundColor: '#FFA50010',
    borderWidth: 1,
    borderColor: '#FFA500',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
  },
  listContent: {
    paddingBottom: 20,
  },
  animationWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ticketNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  priorityIcon: {
    fontSize: 10,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  ticketDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  ticketFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerIcon: {
    fontSize: 10,
  },
  footerText: {
    fontSize: 11,
    color: '#999',
  },
  commentsCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  commentsIcon: {
    fontSize: 12,
  },
  commentsText: {
    fontSize: 11,
    color: '#FFA500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#999',
    fontWeight: '300',
  },
  modalBody: {
    padding: 20,
  },
  ticketDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ticketDetailNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  statusBadgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusTextLarge: {
    fontSize: 12,
    fontWeight: '600',
  },
  ticketDetailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  ticketDetailDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 24,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  priorityBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  priorityIconLarge: {
    fontSize: 12,
  },
  priorityTextLarge: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusUpdateSection: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  statusButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    marginRight: 10,
  },
  activeStatusButton: {
    backgroundColor: '#FFA500',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  activeStatusButtonText: {
    color: '#FFFFFF',
  },
  commentsSection: {
    marginBottom: 24,
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  expandIcon: {
    fontSize: 12,
    color: '#999',
  },
  commentsList: {
    marginBottom: 16,
  },
  commentItem: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentUser: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFA500',
  },
  commentTime: {
    fontSize: 10,
    color: '#999',
  },
  commentText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
    marginBottom: 4,
  },
  statusChangeText: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  noCommentsText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  addCommentSection: {
    marginTop: 8,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#333',
    textAlignVertical: 'top',
    minHeight: 80,
    marginBottom: 12,
  },
  submitCommentButton: {
    backgroundColor: '#FFA500',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  submitCommentText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  closeModalButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  closeModalButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default TicketsScreen;